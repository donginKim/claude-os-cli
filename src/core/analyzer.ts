import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConversationHistory } from './history.js';

/** 분석된 명령어 패턴 */
export interface CommandPattern {
  command: string;
  count: number;
  category: 'build' | 'test' | 'git' | 'dev' | 'deploy' | 'other';
  sessions: number; // 몇 개 세션에서 사용됐는지
}

/** 분석된 도구 사용 패턴 */
export interface ToolPattern {
  tool: string;
  count: number;
  avgPerSession: number;
}

/** 반복 작업 패턴 (명령어 시퀀스) */
export interface WorkflowPattern {
  sequence: string[];
  count: number;
  description: string;
}

/** 스킬 제안 */
export interface SkillSuggestion {
  name: string;
  description: string;
  type: 'command' | 'harness';
  content: string;
  reason: string;
}

/** 분석 결과 */
export interface AnalysisResult {
  totalSessions: number;
  totalMessages: number;
  commands: CommandPattern[];
  tools: ToolPattern[];
  workflows: WorkflowPattern[];
  suggestions: SkillSuggestion[];
}

/** 대화 히스토리 분석기 */
export class HistoryAnalyzer {
  private history: ConversationHistory;

  constructor() {
    this.history = new ConversationHistory();
  }

  /** 전체 히스토리 분석 */
  analyze(cwd?: string): AnalysisResult {
    const sessions = this.history.listSessions(cwd);
    const commandMap = new Map<string, { count: number; sessionSet: Set<string> }>();
    const toolMap = new Map<string, number>();
    const sequenceMap = new Map<string, number>();
    let totalMessages = 0;

    for (const session of sessions) {
      const messages = this.history.getMessages(session.id, cwd);
      totalMessages += messages.length;

      const sessionCommands: string[] = [];

      for (const msg of messages) {
        // Bash 도구의 실제 명령어 추출 (assistant의 tool call 내용에서)
        if (msg.toolCalls) {
          for (const tool of msg.toolCalls) {
            toolMap.set(tool, (toolMap.get(tool) ?? 0) + 1);
          }
        }
      }

      // JSONL에서 직접 Bash 명령어 추출
      const bashCommands = this.extractBashCommands(session.id, cwd);
      for (const cmd of bashCommands) {
        const normalized = this.normalizeCommand(cmd);
        if (!normalized) continue;

        sessionCommands.push(normalized);
        const entry = commandMap.get(normalized) ?? { count: 0, sessionSet: new Set() };
        entry.count++;
        entry.sessionSet.add(session.id);
        commandMap.set(normalized, entry);
      }

      // 연속 명령어 시퀀스 (워크플로우) 감지
      for (let i = 0; i < sessionCommands.length - 1; i++) {
        const seq = `${sessionCommands[i]} → ${sessionCommands[i + 1]}`;
        sequenceMap.set(seq, (sequenceMap.get(seq) ?? 0) + 1);
      }
    }

    const commands = this.buildCommandPatterns(commandMap);
    const tools = this.buildToolPatterns(toolMap, sessions.length);
    const workflows = this.buildWorkflowPatterns(sequenceMap);
    const suggestions = this.generateSuggestions(commands, workflows, cwd);

    return {
      totalSessions: sessions.length,
      totalMessages,
      commands,
      tools,
      workflows,
      suggestions,
    };
  }

  /** JSONL에서 Bash tool_use의 command input 추출 */
  private extractBashCommands(sessionId: string, cwd?: string): string[] {
    const dir = this.history.getProjectDir(cwd);
    if (!dir) return [];

    const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    const match = files.find(f => f.startsWith(sessionId));
    if (!match) return [];

    const content = readFileSync(join(dir, match), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const commands: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant') continue;
        const msgContent = entry.message?.content;
        if (!Array.isArray(msgContent)) continue;

        for (const block of msgContent) {
          if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
            commands.push(block.input.command);
          }
        }
      } catch {
        // skip
      }
    }

    return commands;
  }

  /** 명령어 정규화 (경로, 인자 등 추상화) */
  private normalizeCommand(cmd: string): string | null {
    const trimmed = cmd.trim();
    if (!trimmed || trimmed.length > 200) return null;

    // 시스템 탐색 명령은 무시
    if (/^(cat|head|tail|wc|echo|pwd)\s/.test(trimmed)) return null;
    if (trimmed === 'ls' || trimmed === 'pwd') return null;
    if (/^ls\s/.test(trimmed)) return null;
    if (/^find\s/.test(trimmed)) return null;

    // 일반적인 명령어 패턴 추출
    // npm/yarn/pnpm 명령어
    const npmMatch = trimmed.match(/^(npm|yarn|pnpm|bun)\s+(run\s+)?(\w[\w-]*)/);
    if (npmMatch) return `${npmMatch[1]} run ${npmMatch[3]}`;

    // git 명령어
    const gitMatch = trimmed.match(/^git\s+(\w+)/);
    if (gitMatch) return `git ${gitMatch[1]}`;

    // make 명령어
    const makeMatch = trimmed.match(/^make\s+(\w+)/);
    if (makeMatch) return `make ${makeMatch[1]}`;

    // docker 명령어
    const dockerMatch = trimmed.match(/^docker(-compose)?\s+(\w+)/);
    if (dockerMatch) return `docker${dockerMatch[1] ?? ''} ${dockerMatch[2]}`;

    // go/cargo/python 명령어
    const langMatch = trimmed.match(/^(go|cargo|python|pip|poetry|pytest)\s+(\w+)/);
    if (langMatch) return `${langMatch[1]} ${langMatch[2]}`;

    // curl/http 요청
    if (/^curl\s/.test(trimmed)) return 'curl (HTTP request)';

    // 빌드 관련
    if (/^tsc/.test(trimmed)) return 'tsc';

    // 그 외 단순 명령어
    const simpleMatch = trimmed.match(/^([\w-]+)/);
    if (simpleMatch && trimmed.length < 50) return trimmed;

    return null;
  }

  /** 명령어 카테고리 분류 */
  private categorize(cmd: string): CommandPattern['category'] {
    if (/build|compile|tsc|webpack|vite|esbuild/.test(cmd)) return 'build';
    if (/test|jest|vitest|pytest|cargo test|go test/.test(cmd)) return 'test';
    if (/^git\s/.test(cmd)) return 'git';
    if (/deploy|docker|k8s|kubectl/.test(cmd)) return 'deploy';
    if (/dev|watch|serve|start/.test(cmd)) return 'dev';
    return 'other';
  }

  private buildCommandPatterns(
    map: Map<string, { count: number; sessionSet: Set<string> }>
  ): CommandPattern[] {
    return Array.from(map.entries())
      .map(([command, { count, sessionSet }]) => ({
        command,
        count,
        category: this.categorize(command),
        sessions: sessionSet.size,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private buildToolPatterns(map: Map<string, number>, sessionCount: number): ToolPattern[] {
    return Array.from(map.entries())
      .map(([tool, count]) => ({
        tool,
        count,
        avgPerSession: Math.round((count / sessionCount) * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private buildWorkflowPatterns(map: Map<string, number>): WorkflowPattern[] {
    return Array.from(map.entries())
      .filter(([, count]) => count >= 2)
      .map(([seq, count]) => {
        const parts = seq.split(' → ');
        return {
          sequence: parts,
          count,
          description: this.describeWorkflow(parts),
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  private describeWorkflow(parts: string[]): string {
    const combined = parts.join(' + ');
    if (parts.some(p => /build/.test(p)) && parts.some(p => /test/.test(p))) {
      return '빌드 후 테스트';
    }
    if (parts.some(p => /git add/.test(p)) && parts.some(p => /git commit/.test(p))) {
      return '스테이징 후 커밋';
    }
    if (parts.some(p => /install/.test(p)) && parts.some(p => /build/.test(p))) {
      return '의존성 설치 후 빌드';
    }
    return combined;
  }

  /** 분석 결과 기반 제안 생성 */
  private generateSuggestions(
    commands: CommandPattern[],
    workflows: WorkflowPattern[],
    cwd?: string
  ): SkillSuggestion[] {
    const suggestions: SkillSuggestion[] = [];
    const existingCommands = this.getExistingClaudeCommands(cwd);
    const existingHarness = this.getExistingHarnessCommands(cwd);

    // 1. 자주 사용하는 명령어 → CLAUDE.md Common Commands에 추가 제안
    for (const cmd of commands) {
      if (cmd.count < 2 || cmd.sessions < 2) continue;
      if (cmd.category === 'git') continue; // git 명령어는 제외
      if (existingHarness.some(h => h.includes(cmd.command))) continue;

      suggestions.push({
        name: cmd.command,
        description: `${cmd.count}회 사용 (${cmd.sessions}개 세션)`,
        type: 'harness',
        content: `- ${this.commandLabel(cmd)}: \`${cmd.command}\``,
        reason: `${cmd.sessions}개 세션에서 총 ${cmd.count}회 반복 사용된 명령어입니다.`,
      });
    }

    // 2. 반복 워크플로우 → 프롬프트 스킬 제안
    for (const wf of workflows) {
      if (wf.count < 2) continue;
      const skillName = this.generateSkillName(wf);
      if (existingCommands.includes(skillName)) continue;

      const skillContent = this.generateSkillContent(wf);
      suggestions.push({
        name: skillName,
        description: `${wf.description} (${wf.count}회 반복)`,
        type: 'command',
        content: skillContent,
        reason: `"${wf.sequence.join(' → ')}" 패턴이 ${wf.count}회 반복되었습니다. 스킬로 등록하면 한 번에 실행할 수 있습니다.`,
      });
    }

    // 3. 자주 사용하는 단일 명령어 → 프롬프트 스킬 제안 (3회 이상, 2개 이상 세션)
    for (const cmd of commands) {
      if (cmd.count < 3 || cmd.sessions < 2) continue;
      if (cmd.category === 'git') continue;
      const skillName = this.generateCommandSkillName(cmd);
      if (existingCommands.includes(skillName)) continue;
      if (suggestions.some(s => s.name === skillName)) continue;

      suggestions.push({
        name: skillName,
        description: `빠른 실행: ${cmd.command}`,
        type: 'command',
        content: `# /${skillName}\n\n다음 명령어를 실행해주세요:\n\n\`\`\`bash\n${cmd.command}\n\`\`\`\n\n결과를 간결하게 요약해주세요.`,
        reason: `"${cmd.command}" 명령어가 ${cmd.sessions}개 세션에서 ${cmd.count}회 사용되었습니다.`,
      });
    }

    return suggestions;
  }

  private commandLabel(cmd: CommandPattern): string {
    const labels: Record<CommandPattern['category'], string> = {
      build: 'Build',
      test: 'Test',
      git: 'Git',
      dev: 'Dev',
      deploy: 'Deploy',
      other: 'Run',
    };
    return labels[cmd.category];
  }

  private generateSkillName(wf: WorkflowPattern): string {
    const parts = wf.sequence.map(s => {
      const npmMatch = s.match(/(?:npm|yarn|pnpm)\s+run\s+(\w+)/);
      if (npmMatch) return npmMatch[1];
      const match = s.match(/^(\w+)\s+(\w+)/);
      if (match) return `${match[1]}-${match[2]}`;
      return s.match(/^(\w+)/)?.[1] ?? 'task';
    });
    // 중복 제거
    const unique = [...new Set(parts)];
    return unique.join('-then-');
  }

  private generateCommandSkillName(cmd: CommandPattern): string {
    // npm run build → build, cargo test → cargo-test
    const npmMatch = cmd.command.match(/(?:npm|yarn|pnpm)\s+run\s+(\w[\w-]*)/);
    if (npmMatch) return npmMatch[1];

    return cmd.command
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase()
      .slice(0, 30);
  }

  private generateSkillContent(wf: WorkflowPattern): string {
    const steps = wf.sequence
      .map((cmd, i) => `${i + 1}. \`${cmd}\``)
      .join('\n');

    return `# /${this.generateSkillName(wf)}\n\n${wf.description} 워크플로우를 순서대로 실행해주세요:\n\n${steps}\n\n각 단계의 결과를 간결하게 요약해주세요. 오류가 발생하면 즉시 알려주세요.`;
  }

  /** .claude/commands/ 에 있는 기존 스킬 목록 */
  private getExistingClaudeCommands(cwd?: string): string[] {
    const dir = join(cwd ?? process.cwd(), '.claude', 'commands');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }

  /** CLAUDE.md에서 기존 Common Commands 내용 추출 */
  private getExistingHarnessCommands(cwd?: string): string[] {
    const claudeMdPath = join(cwd ?? process.cwd(), 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) return [];
    const content = readFileSync(claudeMdPath, 'utf-8');
    const lines = content.split('\n');
    const commands: string[] = [];
    let inSection = false;
    for (const line of lines) {
      if (/^##\s+Common Commands/.test(line)) { inSection = true; continue; }
      if (/^##\s/.test(line) && inSection) break;
      if (inSection && line.includes('`')) {
        const match = line.match(/`([^`]+)`/);
        if (match) commands.push(match[1]);
      }
    }
    return commands;
  }
}
