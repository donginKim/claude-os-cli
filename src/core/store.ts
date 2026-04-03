import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ContextSnapshot, ContextData, StoreConfig, BranchInfo, LogEntry, DiffResult } from './types.js';

const STORE_VERSION = 1;

export class ContextStore {
  private root: string;
  private snapshotsDir: string;
  private configPath: string;

  constructor(root?: string) {
    this.root = root ?? join(homedir(), '.claude-os');
    this.snapshotsDir = join(this.root, 'snapshots');
    this.configPath = join(this.root, 'store.json');
  }

  /** 저장소 초기화 */
  init(): void {
    mkdirSync(this.snapshotsDir, { recursive: true });

    if (!existsSync(this.configPath)) {
      const config: StoreConfig = {
        version: STORE_VERSION,
        currentBranch: 'main',
        branches: {
          main: {
            name: 'main',
            head: '',
            createdAt: new Date().toISOString(),
          },
        },
      };
      this.writeConfig(config);
    }
  }

  /** 현재 설정 읽기 */
  getConfig(): StoreConfig {
    if (!existsSync(this.configPath)) {
      throw new Error('claude-os 저장소가 초기화되지 않았습니다. "claude-os init"을 먼저 실행하세요.');
    }
    return JSON.parse(readFileSync(this.configPath, 'utf-8'));
  }

  private writeConfig(config: StoreConfig): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /** 스냅샷 커밋 */
  commit(message: string, data: ContextData, tags: string[] = []): ContextSnapshot {
    const config = this.getConfig();
    const branch = config.currentBranch;
    const parentId = config.branches[branch]?.head || null;

    const snapshot: ContextSnapshot = {
      id: randomUUID(),
      parentId,
      branch,
      message,
      timestamp: new Date().toISOString(),
      author: process.env.USER ?? 'unknown',
      tags,
      data,
    };

    const snapshotPath = join(this.snapshotsDir, `${snapshot.id}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    config.branches[branch].head = snapshot.id;
    this.writeConfig(config);

    return snapshot;
  }

  /** 스냅샷 읽기 */
  getSnapshot(id: string): ContextSnapshot | null {
    // short id 지원
    const resolved = this.resolveId(id);
    if (!resolved) return null;
    const path = join(this.snapshotsDir, `${resolved}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  /** short id → full id 변환 */
  private resolveId(id: string): string | null {
    if (existsSync(join(this.snapshotsDir, `${id}.json`))) return id;

    // short id 매칭
    const files = readdirSync(this.snapshotsDir);
    const matches = files.filter(f => f.startsWith(id));
    if (matches.length === 1) return matches[0].replace('.json', '');
    if (matches.length > 1) throw new Error(`모호한 ID: ${id} (${matches.length}개 매칭)`);
    return null;
  }

  /** 체크아웃: 특정 스냅샷의 컨텍스트를 복원 */
  checkout(target: string): ContextSnapshot {
    const config = this.getConfig();

    // 브랜치명인 경우
    if (config.branches[target]) {
      config.currentBranch = target;
      this.writeConfig(config);
      const headId = config.branches[target].head;
      if (!headId) throw new Error(`브랜치 "${target}"에 스냅샷이 없습니다.`);
      const snapshot = this.getSnapshot(headId);
      if (!snapshot) throw new Error(`스냅샷을 찾을 수 없습니다: ${headId}`);
      return snapshot;
    }

    // 스냅샷 ID인 경우
    const snapshot = this.getSnapshot(target);
    if (!snapshot) throw new Error(`"${target}"을(를) 찾을 수 없습니다. 브랜치명 또는 스냅샷 ID를 확인하세요.`);
    return snapshot;
  }

  /** 브랜치 생성 */
  createBranch(name: string): BranchInfo {
    const config = this.getConfig();
    if (config.branches[name]) throw new Error(`브랜치 "${name}"이(가) 이미 존재합니다.`);

    const currentHead = config.branches[config.currentBranch]?.head ?? '';
    const branch: BranchInfo = {
      name,
      head: currentHead,
      createdAt: new Date().toISOString(),
    };
    config.branches[name] = branch;
    config.currentBranch = name;
    this.writeConfig(config);
    return branch;
  }

  /** 브랜치 목록 */
  listBranches(): { branches: BranchInfo[]; current: string } {
    const config = this.getConfig();
    return {
      branches: Object.values(config.branches),
      current: config.currentBranch,
    };
  }

  /** 로그: 현재 브랜치의 스냅샷 히스토리 */
  log(limit = 20): LogEntry[] {
    const config = this.getConfig();
    const entries: LogEntry[] = [];
    let currentId: string | null = config.branches[config.currentBranch]?.head ?? null;

    while (currentId && entries.length < limit) {
      const snapshot = this.getSnapshot(currentId);
      if (!snapshot) break;

      entries.push({
        id: snapshot.id,
        shortId: snapshot.id.slice(0, 8),
        branch: snapshot.branch,
        message: snapshot.message,
        timestamp: snapshot.timestamp,
        tags: snapshot.tags,
      });
      currentId = snapshot.parentId;
    }
    return entries;
  }

  /** Diff: 두 스냅샷 비교 */
  diff(idA: string, idB: string): DiffResult[] {
    const a = this.getSnapshot(idA);
    const b = this.getSnapshot(idB);
    if (!a) throw new Error(`스냅샷을 찾을 수 없습니다: ${idA}`);
    if (!b) throw new Error(`스냅샷을 찾을 수 없습니다: ${idB}`);

    const results: DiffResult[] = [];

    // CLAUDE.md diff
    if (a.data.claudeMd !== b.data.claudeMd) {
      results.push({ file: 'CLAUDE.md', changes: formatTextDiff(a.data.claudeMd ?? '', b.data.claudeMd ?? '') });
    }

    // memories diff
    const allMemKeys = new Set([...Object.keys(a.data.memories), ...Object.keys(b.data.memories)]);
    for (const key of allMemKeys) {
      const va = a.data.memories[key] ?? '';
      const vb = b.data.memories[key] ?? '';
      if (va !== vb) {
        results.push({ file: `memory/${key}`, changes: formatTextDiff(va, vb) });
      }
    }

    // settings diff
    const sa = JSON.stringify(a.data.settings, null, 2) ?? '';
    const sb = JSON.stringify(b.data.settings, null, 2) ?? '';
    if (sa !== sb) {
      results.push({ file: 'settings.json', changes: formatTextDiff(sa, sb) });
    }

    return results;
  }

  /** 태그 추가 */
  tag(snapshotId: string, tagName: string): void {
    const resolved = this.resolveId(snapshotId);
    if (!resolved) throw new Error(`스냅샷을 찾을 수 없습니다: ${snapshotId}`);
    const path = join(this.snapshotsDir, `${resolved}.json`);
    const snapshot: ContextSnapshot = JSON.parse(readFileSync(path, 'utf-8'));
    if (!snapshot.tags.includes(tagName)) {
      snapshot.tags.push(tagName);
      writeFileSync(path, JSON.stringify(snapshot, null, 2));
    }
  }

  /** 저장소 루트 경로 */
  getRoot(): string {
    return this.root;
  }
}

function formatTextDiff(a: string, b: string): string {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const output: string[] = [];

  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const la = linesA[i];
    const lb = linesB[i];
    if (la === undefined) {
      output.push(`+ ${lb}`);
    } else if (lb === undefined) {
      output.push(`- ${la}`);
    } else if (la !== lb) {
      output.push(`- ${la}`);
      output.push(`+ ${lb}`);
    }
  }
  return output.join('\n');
}
