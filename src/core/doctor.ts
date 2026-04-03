import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 진단 항목 상태 */
export type DiagStatus = 'ok' | 'warn' | 'error' | 'missing';

/** 진단 항목 */
export interface DiagItem {
  label: string;
  status: DiagStatus;
  detail: string;
  suggestion?: string;
}

/** 진단 섹션 */
export interface DiagSection {
  name: string;
  items: DiagItem[];
}

/** 전체 진단 결과 */
export interface DiagReport {
  sections: DiagSection[];
  score: number; // 0-100
}

/** 컨텍스트 건강 진단기 */
export class ContextDoctor {
  private cwd: string;
  private claudeDir: string;
  private projectClaudeDir: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
    this.claudeDir = join(homedir(), '.claude');
    // 프로젝트별 Claude 디렉토리
    const encoded = this.cwd.replace(/\//g, '-');
    this.projectClaudeDir = join(this.claudeDir, 'projects', encoded);
  }

  /** 전체 진단 실행 */
  diagnose(): DiagReport {
    const sections: DiagSection[] = [
      this.checkClaudeMd(),
      this.checkMemories(),
      this.checkSettings(),
      this.checkSkills(),
      this.checkHooks(),
      this.checkMcp(),
    ];

    const allItems = sections.flatMap(s => s.items);
    const total = allItems.length;
    const okCount = allItems.filter(i => i.status === 'ok').length;
    const warnCount = allItems.filter(i => i.status === 'warn').length;
    const score = total > 0
      ? Math.round(((okCount + warnCount * 0.5) / total) * 100)
      : 0;

    return { sections, score };
  }

  /** CLAUDE.md 진단 */
  private checkClaudeMd(): DiagSection {
    const items: DiagItem[] = [];
    const paths = [
      join(this.cwd, 'CLAUDE.md'),
      join(this.cwd, '.claude', 'CLAUDE.md'),
    ];

    const found = paths.find(p => existsSync(p));
    if (!found) {
      items.push({
        label: 'CLAUDE.md',
        status: 'missing',
        detail: '파일이 존재하지 않습니다',
        suggestion: 'claude-os init --harness 로 생성하세요',
      });
      return { name: 'CLAUDE.md', items };
    }

    const content = readFileSync(found, 'utf-8');
    const lines = content.split('\n');
    items.push({
      label: 'CLAUDE.md',
      status: 'ok',
      detail: `${lines.length}줄`,
    });

    // 섹션 체크
    const requiredSections = [
      { pattern: /## (Tech Stack|기술 스택)/, label: 'Tech Stack' },
      { pattern: /## Common Commands/, label: 'Common Commands' },
      { pattern: /## Coding Conventions/, label: 'Coding Conventions' },
      { pattern: /## Architecture/, label: 'Architecture' },
    ];

    for (const sec of requiredSections) {
      const match = lines.findIndex(l => sec.pattern.test(l));
      if (match === -1) {
        items.push({
          label: `  ├─ ${sec.label}`,
          status: 'missing',
          detail: '섹션 없음',
          suggestion: `${sec.label} 섹션을 추가하세요`,
        });
      } else {
        // 섹션 내용이 비어있는지 확인
        const nextSection = lines.findIndex((l, i) => i > match && /^##\s/.test(l));
        const end = nextSection === -1 ? lines.length : nextSection;
        const sectionContent = lines.slice(match + 1, end).join('\n').trim();
        const isEmpty = !sectionContent || /^<!--.*-->$/.test(sectionContent);

        items.push({
          label: `  ├─ ${sec.label}`,
          status: isEmpty ? 'warn' : 'ok',
          detail: isEmpty ? '비어있음' : `${sectionContent.split('\n').length}줄`,
          suggestion: isEmpty ? `${sec.label} 내용을 채워주세요` : undefined,
        });
      }
    }

    // 파일 크기 체크
    if (lines.length > 500) {
      items.push({
        label: '  └─ 크기',
        status: 'warn',
        detail: `${lines.length}줄 (권장: 500줄 이하)`,
        suggestion: '너무 긴 CLAUDE.md는 컨텍스트를 낭비합니다. 핵심만 남기세요.',
      });
    }

    return { name: 'CLAUDE.md', items };
  }

  /** 메모리 진단 */
  private checkMemories(): DiagSection {
    const items: DiagItem[] = [];
    const memDir = join(this.projectClaudeDir, 'memory');

    if (!existsSync(memDir)) {
      items.push({
        label: '메모리',
        status: 'missing',
        detail: '메모리 디렉토리 없음',
        suggestion: '대화를 통해 메모리가 자연스럽게 쌓입니다',
      });
      return { name: '메모리', items };
    }

    const files = readdirSync(memDir).filter(f => f.endsWith('.md'));
    items.push({
      label: '메모리',
      status: files.length > 0 ? 'ok' : 'warn',
      detail: `${files.length}개 파일`,
    });

    // MEMORY.md 인덱스 확인
    const indexPath = join(memDir, 'MEMORY.md');
    if (existsSync(indexPath)) {
      const indexContent = readFileSync(indexPath, 'utf-8');
      const indexLines = indexContent.split('\n').filter(l => l.trim().startsWith('-'));
      const memFiles = files.filter(f => f !== 'MEMORY.md');

      if (indexLines.length < memFiles.length) {
        items.push({
          label: '  ├─ 인덱스',
          status: 'warn',
          detail: `MEMORY.md에 ${indexLines.length}개 등록, 실제 ${memFiles.length}개`,
          suggestion: '인덱스에 누락된 메모리가 있습니다',
        });
      } else {
        items.push({
          label: '  ├─ 인덱스',
          status: 'ok',
          detail: `${indexLines.length}개 등록`,
        });
      }
    }

    // stale 메모리 감지
    const now = Date.now();
    const staleThreshold = 60 * 24 * 60 * 60 * 1000; // 60일
    const staleFiles: string[] = [];

    for (const file of files) {
      if (file === 'MEMORY.md') continue;
      const filePath = join(memDir, file);
      const stat = statSync(filePath);
      if (now - stat.mtime.getTime() > staleThreshold) {
        staleFiles.push(file);
      }
    }

    if (staleFiles.length > 0) {
      items.push({
        label: '  ├─ 오래된 메모리',
        status: 'warn',
        detail: `${staleFiles.length}개 (60일+)`,
        suggestion: `claude-os memory list --stale 60 으로 확인 후 정리하세요`,
      });
    }

    // 중복 감지 (제목 유사도)
    const duplicates = this.detectDuplicateMemories(memDir, files);
    if (duplicates.length > 0) {
      items.push({
        label: '  └─ 중복 의심',
        status: 'warn',
        detail: duplicates.map(d => `${d[0]} ↔ ${d[1]}`).join(', '),
        suggestion: '비슷한 메모리를 병합하세요',
      });
    }

    return { name: '메모리', items };
  }

  /** 설정 진단 */
  private checkSettings(): DiagSection {
    const items: DiagItem[] = [];

    // 글로벌 설정
    const globalSettings = join(this.claudeDir, 'settings.json');
    if (existsSync(globalSettings)) {
      items.push({
        label: '글로벌 설정',
        status: 'ok',
        detail: 'settings.json 존재',
      });
    } else {
      items.push({
        label: '글로벌 설정',
        status: 'warn',
        detail: '설정 파일 없음',
        suggestion: '기본 설정으로 동작 중입니다',
      });
    }

    // 프로젝트 설정
    const projectSettings = join(this.cwd, '.claude', 'settings.json');
    if (existsSync(projectSettings)) {
      items.push({
        label: '프로젝트 설정',
        status: 'ok',
        detail: '.claude/settings.json 존재',
      });
    }

    return { name: '설정', items };
  }

  /** 스킬 (커스텀 커맨드) 진단 */
  private checkSkills(): DiagSection {
    const items: DiagItem[] = [];
    const commandsDir = join(this.cwd, '.claude', 'commands');

    if (!existsSync(commandsDir)) {
      items.push({
        label: '프롬프트 스킬',
        status: 'missing',
        detail: '.claude/commands/ 없음',
        suggestion: 'claude-os analyze --apply 로 자동 생성하거나 직접 추가하세요',
      });
    } else {
      const skills = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
      items.push({
        label: '프롬프트 스킬',
        status: skills.length > 0 ? 'ok' : 'warn',
        detail: `${skills.length}개 등록`,
      });

      for (const skill of skills) {
        const content = readFileSync(join(commandsDir, skill), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim()).length;
        items.push({
          label: `  ├─ /${skill.replace('.md', '')}`,
          status: 'ok',
          detail: `${lines}줄`,
        });
      }
    }

    return { name: '스킬', items };
  }

  /** Hook 진단 */
  private checkHooks(): DiagSection {
    const items: DiagItem[] = [];
    const settingsPaths = [
      join(this.cwd, '.claude', 'settings.json'),
      join(this.claudeDir, 'settings.json'),
    ];

    let hookCount = 0;
    for (const p of settingsPaths) {
      if (!existsSync(p)) continue;
      try {
        const settings = JSON.parse(readFileSync(p, 'utf-8'));
        if (settings.hooks) {
          const hooks = Object.entries(settings.hooks);
          hookCount += hooks.length;
          for (const [event, handlers] of hooks) {
            const handlerList = Array.isArray(handlers) ? handlers : [handlers];
            items.push({
              label: `  ├─ ${event}`,
              status: 'ok',
              detail: `${handlerList.length}개 핸들러`,
            });
          }
        }
      } catch { /* skip */ }
    }

    if (hookCount === 0) {
      items.push({
        label: 'Hooks',
        status: 'missing',
        detail: '설정된 hook 없음',
        suggestion: 'claude-os hooks templates 로 추천 hook을 확인하세요',
      });
    } else {
      items.unshift({
        label: 'Hooks',
        status: 'ok',
        detail: `${hookCount}개 이벤트`,
      });
    }

    return { name: 'Hooks', items };
  }

  /** MCP 서버 진단 */
  private checkMcp(): DiagSection {
    const items: DiagItem[] = [];
    const mcpPaths = [
      join(this.cwd, '.claude', 'mcp.json'),
      join(this.cwd, '.mcp.json'),
      join(this.claudeDir, 'mcp.json'),
    ];

    let found = false;
    for (const p of mcpPaths) {
      if (!existsSync(p)) continue;
      found = true;
      try {
        const config = JSON.parse(readFileSync(p, 'utf-8'));
        const servers = Object.keys(config.mcpServers ?? {});
        items.push({
          label: 'MCP 서버',
          status: servers.length > 0 ? 'ok' : 'warn',
          detail: `${servers.length}개 서버 (${p.includes('.claude/') ? '프로젝트' : '글로벌'})`,
        });
        for (const s of servers) {
          items.push({
            label: `  ├─ ${s}`,
            status: 'ok',
            detail: config.mcpServers[s].command ?? 'configured',
          });
        }
      } catch { /* skip */ }
    }

    if (!found) {
      items.push({
        label: 'MCP 서버',
        status: 'missing',
        detail: '설정 없음',
        suggestion: 'MCP 서버로 외부 도구를 연결할 수 있습니다',
      });
    }

    return { name: 'MCP', items };
  }

  /** 메모리 파일명 기반 중복 감지 */
  private detectDuplicateMemories(dir: string, files: string[]): [string, string][] {
    const duplicates: [string, string][] = [];
    const memFiles = files.filter(f => f !== 'MEMORY.md');

    for (let i = 0; i < memFiles.length; i++) {
      for (let j = i + 1; j < memFiles.length; j++) {
        const a = memFiles[i].replace('.md', '').toLowerCase();
        const b = memFiles[j].replace('.md', '').toLowerCase();

        // 같은 prefix를 공유하면 중복 의심
        const prefixA = a.split(/[_-]/)[0];
        const prefixB = b.split(/[_-]/)[0];
        if (prefixA === prefixB && prefixA.length > 3) {
          duplicates.push([memFiles[i], memFiles[j]]);
        }
      }
    }

    return duplicates;
  }
}
