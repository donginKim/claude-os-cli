import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

/** 동기화 번들 */
export interface SyncBundle {
  version: number;
  exportedAt: string;
  source: string;
  claudeMd: string | null;
  memories: Record<string, string>;
  commands: Record<string, string>;
  settings: Record<string, unknown> | null;
  hooks: Record<string, unknown> | null;
}

/** Import 결과 */
export interface ImportResult {
  applied: string[];
  skipped: string[];
}

/** 컨텍스트 동기화 관리자 */
export class ContextSync {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /** 현재 프로젝트 컨텍스트를 번들로 내보내기 */
  export(): SyncBundle {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: this.cwd,
      claudeMd: this.readFile(join(this.cwd, 'CLAUDE.md')),
      memories: this.readMemories(),
      commands: this.readCommands(),
      settings: this.readJson(join(this.cwd, '.claude', 'settings.json')),
      hooks: this.extractHooks(),
    };
  }

  /** 번들을 현재 프로젝트에 가져오기 */
  import(bundle: SyncBundle, opts?: {
    claudeMd?: boolean;
    memories?: boolean;
    commands?: boolean;
    settings?: boolean;
    hooks?: boolean;
  }): ImportResult {
    const result: ImportResult = { applied: [], skipped: [] };
    const options = opts ?? { claudeMd: true, memories: true, commands: true, settings: true, hooks: true };

    // 1. CLAUDE.md
    if (options.claudeMd && bundle.claudeMd) {
      const target = join(this.cwd, 'CLAUDE.md');
      if (existsSync(target)) {
        // 병합: 기존 내용에 없는 섹션만 추가
        const merged = this.mergeClaudeMd(
          readFileSync(target, 'utf-8'),
          bundle.claudeMd
        );
        writeFileSync(target, merged);
        result.applied.push('CLAUDE.md (병합)');
      } else {
        writeFileSync(target, bundle.claudeMd);
        result.applied.push('CLAUDE.md (생성)');
      }
    } else if (options.claudeMd) {
      result.skipped.push('CLAUDE.md (소스에 없음)');
    }

    // 2. 메모리
    if (options.memories && Object.keys(bundle.memories).length > 0) {
      const encoded = this.cwd.replace(/\//g, '-');
      const memDir = join(homedir(), '.claude', 'projects', encoded, 'memory');
      mkdirSync(memDir, { recursive: true });

      for (const [name, content] of Object.entries(bundle.memories)) {
        const target = join(memDir, name);
        if (!existsSync(target)) {
          writeFileSync(target, content);
          result.applied.push(`메모리: ${name}`);
        } else {
          result.skipped.push(`메모리: ${name} (이미 존재)`);
        }
      }
    }

    // 3. 커맨드
    if (options.commands && Object.keys(bundle.commands).length > 0) {
      const commandsDir = join(this.cwd, '.claude', 'commands');
      mkdirSync(commandsDir, { recursive: true });

      for (const [name, content] of Object.entries(bundle.commands)) {
        const target = join(commandsDir, name);
        if (!existsSync(target)) {
          writeFileSync(target, content);
          result.applied.push(`스킬: ${name}`);
        } else {
          result.skipped.push(`스킬: ${name} (이미 존재)`);
        }
      }
    }

    // 4. Hooks
    if (options.hooks && bundle.hooks && Object.keys(bundle.hooks).length > 0) {
      const settingsPath = join(this.cwd, '.claude', 'settings.json');
      mkdirSync(join(this.cwd, '.claude'), { recursive: true });

      let settings: Record<string, any> = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* */ }
      }

      if (!settings.hooks) settings.hooks = {};
      for (const [event, handlers] of Object.entries(bundle.hooks)) {
        if (!settings.hooks[event]) {
          settings.hooks[event] = handlers;
          result.applied.push(`Hook: ${event}`);
        } else {
          result.skipped.push(`Hook: ${event} (이미 존재)`);
        }
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }

    return result;
  }

  /** 번들 파일에서 로드 */
  static loadBundle(filePath: string): SyncBundle {
    if (!existsSync(filePath)) throw new Error(`번들 파일을 찾을 수 없습니다: ${filePath}`);
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  /** CLAUDE.md 병합 — 소스에만 있는 섹션을 타겟에 추가 */
  private mergeClaudeMd(target: string, source: string): string {
    const targetSections = this.parseSections(target);
    const sourceSections = this.parseSections(source);

    let merged = target;
    for (const [heading, content] of Object.entries(sourceSections)) {
      if (!targetSections[heading]) {
        merged += `\n## ${heading}\n${content}\n`;
      }
    }

    return merged;
  }

  private parseSections(md: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = md.split('\n');
    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) {
        if (currentHeading) {
          sections[currentHeading] = currentContent.join('\n').trim();
        }
        currentHeading = headingMatch[1];
        currentContent = [];
      } else if (currentHeading) {
        currentContent.push(line);
      }
    }

    if (currentHeading) {
      sections[currentHeading] = currentContent.join('\n').trim();
    }

    return sections;
  }

  private readFile(path: string): string | null {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null;
  }

  private readJson(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
  }

  private readMemories(): Record<string, string> {
    const encoded = this.cwd.replace(/\//g, '-');
    const memDir = join(homedir(), '.claude', 'projects', encoded, 'memory');
    if (!existsSync(memDir)) return {};

    const memories: Record<string, string> = {};
    for (const file of readdirSync(memDir).filter(f => f.endsWith('.md'))) {
      memories[file] = readFileSync(join(memDir, file), 'utf-8');
    }
    return memories;
  }

  private readCommands(): Record<string, string> {
    const dir = join(this.cwd, '.claude', 'commands');
    if (!existsSync(dir)) return {};

    const commands: Record<string, string> = {};
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      commands[file] = readFileSync(join(dir, file), 'utf-8');
    }
    return commands;
  }

  private extractHooks(): Record<string, unknown> | null {
    const settingsPath = join(this.cwd, '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return null;
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      return settings.hooks ?? null;
    } catch { return null; }
  }
}
