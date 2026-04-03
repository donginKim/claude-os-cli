import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Hook 핸들러 */
export interface HookHandler {
  command: string;
  description?: string;
}

/** Hook 템플릿 */
export interface HookTemplate {
  name: string;
  event: string;
  description: string;
  handler: HookHandler;
}

/** Hooks 관리자 */
export class HooksManager {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /** 현재 설정된 hooks 조회 */
  list(): { event: string; handlers: HookHandler[] }[] {
    const settings = this.readSettings();
    if (!settings?.hooks) return [];

    return Object.entries(settings.hooks).map(([event, handlers]) => ({
      event,
      handlers: Array.isArray(handlers) ? handlers as HookHandler[] : [handlers as HookHandler],
    }));
  }

  /** Hook 추가 (템플릿 이름 또는 직접 지정) */
  add(eventOrTemplateName: string, handler?: HookHandler): { event: string; handler: HookHandler } {
    // 템플릿 이름인 경우
    const template = this.getTemplates().find(t => t.name === eventOrTemplateName);
    if (template) {
      return this.addHook(template.event, template.handler);
    }

    // 직접 지정
    if (!handler) {
      throw new Error(`"${eventOrTemplateName}"은 알 수 없는 템플릿입니다. claude-os hooks templates 로 목록을 확인하세요.`);
    }

    return this.addHook(eventOrTemplateName, handler);
  }

  /** Hook 제거 */
  remove(event: string, index?: number): boolean {
    const settings = this.readSettings();
    if (!settings?.hooks?.[event]) return false;

    if (index !== undefined) {
      const handlers = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [settings.hooks[event]];
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = handlers;
      }
    } else {
      delete settings.hooks[event];
    }

    this.writeSettings(settings);
    return true;
  }

  /** 사용 가능한 템플릿 */
  getTemplates(): HookTemplate[] {
    return [
      {
        name: 'pre-commit-lint',
        event: 'PreToolUse',
        description: '코드 변경 전 린트 체크',
        handler: {
          command: 'npm run lint --silent 2>/dev/null || true',
          description: 'Lint check before code changes',
        },
      },
      {
        name: 'auto-test',
        event: 'PostToolUse',
        description: '파일 수정 후 관련 테스트 자동 실행',
        handler: {
          command: 'npm test --silent 2>/dev/null || true',
          description: 'Run tests after file changes',
        },
      },
      {
        name: 'format-on-save',
        event: 'PostToolUse',
        description: '파일 저장 후 자동 포맷팅',
        handler: {
          command: 'npx prettier --write . --silent 2>/dev/null || true',
          description: 'Auto-format after file save',
        },
      },
      {
        name: 'type-check',
        event: 'PostToolUse',
        description: '코드 변경 후 타입 체크',
        handler: {
          command: 'npx tsc --noEmit --silent 2>/dev/null || true',
          description: 'TypeScript type check after changes',
        },
      },
      {
        name: 'build-check',
        event: 'PostToolUse',
        description: '코드 변경 후 빌드 확인',
        handler: {
          command: 'npm run build --silent 2>/dev/null || true',
          description: 'Build check after code changes',
        },
      },
      {
        name: 'git-status',
        event: 'PostToolUse',
        description: '작업 후 git 상태 표시',
        handler: {
          command: 'git diff --stat 2>/dev/null || true',
          description: 'Show git diff stats after changes',
        },
      },
      {
        name: 'notify-change',
        event: 'PostToolUse',
        description: '파일 변경 시 시스템 알림',
        handler: {
          command: 'osascript -e \'display notification "Claude Code가 파일을 수정했습니다" with title "Claude OS"\' 2>/dev/null || true',
          description: 'System notification on file change',
        },
      },
    ];
  }

  private addHook(event: string, handler: HookHandler): { event: string; handler: HookHandler } {
    const settings = this.readSettings() ?? {};
    if (!settings.hooks) settings.hooks = {};

    if (!settings.hooks[event]) {
      settings.hooks[event] = [handler];
    } else {
      const existing = Array.isArray(settings.hooks[event])
        ? settings.hooks[event]
        : [settings.hooks[event]];
      existing.push(handler);
      settings.hooks[event] = existing;
    }

    this.writeSettings(settings);
    return { event, handler };
  }

  private readSettings(): Record<string, any> | null {
    const settingsPath = join(this.cwd, '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return null;
    try {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private writeSettings(settings: Record<string, any>): void {
    const dir = join(this.cwd, '.claude');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
  }
}
