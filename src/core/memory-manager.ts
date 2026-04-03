import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

/** 메모리 파일 정보 */
export interface MemoryFile {
  name: string;
  path: string;
  type: string;
  description: string;
  content: string;
  size: number;
  modifiedAt: Date;
  ageDays: number;
}

/** compact 제안 */
export interface CompactSuggestion {
  action: 'delete' | 'merge' | 'update';
  files: string[];
  reason: string;
}

/** 메모리 관리자 */
export class MemoryManager {
  private cwd: string;
  private claudeDir: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
    this.claudeDir = join(homedir(), '.claude');
  }

  /** 프로젝트 메모리 디렉토리 */
  private getMemoryDir(): string | null {
    const encoded = this.cwd.replace(/\//g, '-');
    const dir = join(this.claudeDir, 'projects', encoded, 'memory');
    return existsSync(dir) ? dir : null;
  }

  /** 메모리 목록 조회 */
  list(opts?: { stale?: number; type?: string }): MemoryFile[] {
    const dir = this.getMemoryDir();
    if (!dir) return [];

    const now = Date.now();
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .map(f => this.parseMemoryFile(join(dir, f)))
      .filter((f): f is MemoryFile => f !== null);

    let result = files;

    if (opts?.stale) {
      const threshold = opts.stale * 24 * 60 * 60 * 1000;
      result = result.filter(f => now - f.modifiedAt.getTime() > threshold);
    }

    if (opts?.type) {
      result = result.filter(f => f.type === opts.type);
    }

    return result.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  /** 메모리 파일 내용 조회 */
  show(name: string): MemoryFile | null {
    const dir = this.getMemoryDir();
    if (!dir) return null;

    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const filePath = join(dir, fileName);
    if (!existsSync(filePath)) return null;

    return this.parseMemoryFile(filePath);
  }

  /** 메모리 삭제 */
  remove(name: string): boolean {
    const dir = this.getMemoryDir();
    if (!dir) return false;

    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const filePath = join(dir, fileName);
    if (!existsSync(filePath)) return false;

    unlinkSync(filePath);

    // MEMORY.md 인덱스에서도 제거
    this.removeFromIndex(dir, fileName);
    return true;
  }

  /** compact 제안 생성 */
  compact(): CompactSuggestion[] {
    const files = this.list();
    const suggestions: CompactSuggestion[] = [];

    // 1. 오래된 메모리 삭제 제안
    const staleFiles = files.filter(f => f.ageDays > 90);
    if (staleFiles.length > 0) {
      suggestions.push({
        action: 'delete',
        files: staleFiles.map(f => f.name),
        reason: `90일 이상 업데이트되지 않은 메모리 (${staleFiles.length}개)`,
      });
    }

    // 2. 같은 type의 유사 메모리 병합 제안
    const byType = new Map<string, MemoryFile[]>();
    for (const f of files) {
      const list = byType.get(f.type) ?? [];
      list.push(f);
      byType.set(f.type, list);
    }

    for (const [type, typeFiles] of byType) {
      if (typeFiles.length < 2) continue;

      // prefix 기반 그룹핑
      const groups = new Map<string, MemoryFile[]>();
      for (const f of typeFiles) {
        const prefix = f.name.split(/[_-]/)[0];
        const list = groups.get(prefix) ?? [];
        list.push(f);
        groups.set(prefix, list);
      }

      for (const [prefix, groupFiles] of groups) {
        if (groupFiles.length >= 2) {
          suggestions.push({
            action: 'merge',
            files: groupFiles.map(f => f.name),
            reason: `같은 유형(${type})의 유사 메모리 — 병합 검토`,
          });
        }
      }
    }

    // 3. 빈 또는 매우 짧은 메모리
    const shortFiles = files.filter(f => f.content.trim().split('\n').length <= 3);
    for (const f of shortFiles) {
      suggestions.push({
        action: 'update',
        files: [f.name],
        reason: `내용이 너무 짧습니다 (${f.content.trim().split('\n').length}줄)`,
      });
    }

    return suggestions;
  }

  /** 메모리 파일 파싱 */
  private parseMemoryFile(filePath: string): MemoryFile | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const stat = statSync(filePath);
      const name = basename(filePath);
      const ageDays = Math.floor((Date.now() - stat.mtime.getTime()) / (24 * 60 * 60 * 1000));

      // frontmatter 파싱
      let type = 'unknown';
      let description = '';

      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        const typeMatch = fm.match(/^type:\s*(.+)/m);
        const descMatch = fm.match(/^description:\s*(.+)/m);
        if (typeMatch) type = typeMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
      }

      return {
        name,
        path: filePath,
        type,
        description,
        content,
        size: content.length,
        modifiedAt: stat.mtime,
        ageDays,
      };
    } catch {
      return null;
    }
  }

  /** MEMORY.md 인덱스에서 항목 제거 */
  private removeFromIndex(dir: string, fileName: string): void {
    const indexPath = join(dir, 'MEMORY.md');
    if (!existsSync(indexPath)) return;

    const content = readFileSync(indexPath, 'utf-8');
    const lines = content.split('\n');
    const filtered = lines.filter(l => !l.includes(fileName));
    writeFileSync(indexPath, filtered.join('\n'));
  }
}
