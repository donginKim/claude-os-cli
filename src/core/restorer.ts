import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ContextSnapshot } from './types.js';

/**
 * 스냅샷의 컨텍스트를 실제 파일시스템에 복원
 */
export class ContextRestorer {
  /** 스냅샷 데이터를 파일시스템에 복원 */
  restore(snapshot: ContextSnapshot, targetDir?: string): string[] {
    const restored: string[] = [];
    const cwd = targetDir ?? snapshot.data.projectMeta.workingDirectory;

    // CLAUDE.md 복원
    if (snapshot.data.claudeMd !== null) {
      const claudeMdPath = join(cwd, 'CLAUDE.md');
      mkdirSync(dirname(claudeMdPath), { recursive: true });
      writeFileSync(claudeMdPath, snapshot.data.claudeMd);
      restored.push('CLAUDE.md');
    }

    // settings 복원
    if (snapshot.data.settings) {
      const settingsDir = join(cwd, '.claude');
      mkdirSync(settingsDir, { recursive: true });
      writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify(snapshot.data.settings, null, 2));
      restored.push('.claude/settings.json');
    }

    // memories 복원
    for (const [key, content] of Object.entries(snapshot.data.memories)) {
      let targetPath: string;

      if (key.startsWith('global/')) {
        const fileName = key.replace('global/', '');
        targetPath = join(homedir(), '.claude', 'memory', fileName);
      } else if (key.startsWith('project/')) {
        const parts = key.replace('project/', '').split('/');
        const projectDir = parts[0];
        const fileName = parts.slice(1).join('/');
        targetPath = join(homedir(), '.claude', 'projects', projectDir, 'memory', fileName);
      } else {
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, content);
      restored.push(key);
    }

    return restored;
  }
}
