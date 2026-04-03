import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

/** 대화 메시지 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  toolCalls?: string[];
}

/** 세션 요약 */
export interface SessionSummary {
  id: string;
  shortId: string;
  firstMessage: string;
  messageCount: number;
  timestamp: string;
  branch?: string;
}

/** Claude Code 대화 히스토리 파서 */
export class ConversationHistory {
  private projectsDir: string;

  constructor() {
    this.projectsDir = join(homedir(), '.claude', 'projects');
  }

  /** 현재 작업 디렉토리에 해당하는 프로젝트 대화 디렉토리 찾기 */
  getProjectDir(cwd?: string): string | null {
    const targetDir = cwd ?? process.cwd();
    // Claude Code는 경로를 '-'로 인코딩: /Users/foo/bar → -Users-foo-bar
    const encoded = targetDir.replace(/\//g, '-');

    const candidates = readdirSync(this.projectsDir).filter(d => {
      const fullPath = join(this.projectsDir, d);
      return statSync(fullPath).isDirectory() && encoded.startsWith(d);
    });

    // 가장 긴 매칭 (가장 구체적인 프로젝트)
    candidates.sort((a, b) => b.length - a.length);

    // 정확히 매칭되는 것 우선
    const exact = candidates.find(c => c === encoded);
    return exact
      ? join(this.projectsDir, exact)
      : candidates.length > 0
        ? join(this.projectsDir, candidates[0])
        : null;
  }

  /** 프로젝트의 세션 목록 조회 */
  listSessions(cwd?: string): SessionSummary[] {
    const dir = this.getProjectDir(cwd);
    if (!dir) return [];

    const files = readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return files.map(f => {
      const id = basename(f.name, '.jsonl');
      const messages = this.parseFile(f.path);
      const firstUserMsg = messages.find(m => m.role === 'user');
      return {
        id,
        shortId: id.slice(0, 8),
        firstMessage: firstUserMsg?.text.slice(0, 80) ?? '(empty)',
        messageCount: messages.length,
        timestamp: f.mtime.toISOString(),
        branch: this.extractBranch(f.path),
      };
    });
  }

  /** 특정 세션의 대화 내용 파싱 */
  getMessages(sessionId: string, cwd?: string): ConversationMessage[] {
    const dir = this.getProjectDir(cwd);
    if (!dir) return [];

    const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    const match = files.find(f => f.startsWith(sessionId));
    if (!match) return [];

    return this.parseFile(join(dir, match));
  }

  /** JSONL 파일 파싱 → 메시지 배열 (연속된 같은 role 메시지를 하나의 턴으로 병합) */
  private parseFile(path: string): ConversationMessage[] {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const raw: ConversationMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'user' && entry.type !== 'assistant') continue;

        const role = entry.type as 'user' | 'assistant';
        const msgContent = entry.message?.content;
        const timestamp = entry.timestamp ?? '';

        if (typeof msgContent === 'string') {
          if (msgContent.trim()) {
            raw.push({ role, text: msgContent.trim(), timestamp });
          }
        } else if (Array.isArray(msgContent)) {
          const texts: string[] = [];
          const tools: string[] = [];

          for (const block of msgContent) {
            if (block.type === 'text' && block.text?.trim()) {
              texts.push(block.text.trim());
            } else if (block.type === 'tool_use') {
              tools.push(block.name ?? 'unknown');
            }
          }

          if (texts.length > 0 || tools.length > 0) {
            raw.push({
              role,
              text: texts.join('\n'),
              timestamp,
              toolCalls: tools.length > 0 ? tools : undefined,
            });
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    // 연속된 같은 role 메시지를 하나의 턴으로 병합
    const messages: ConversationMessage[] = [];
    for (const msg of raw) {
      const prev = messages[messages.length - 1];
      if (prev && prev.role === msg.role) {
        // 텍스트 병합
        if (msg.text) {
          prev.text = prev.text ? prev.text + '\n' + msg.text : msg.text;
        }
        // 도구 호출 병합
        if (msg.toolCalls) {
          prev.toolCalls = [...(prev.toolCalls ?? []), ...msg.toolCalls];
        }
      } else {
        messages.push({ ...msg });
      }
    }

    return messages;
  }

  /** 파일에서 git branch 추출 */
  private extractBranch(path: string): string | undefined {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.gitBranch) return entry.gitBranch;
      } catch {
        // skip
      }
    }
    return undefined;
  }
}
