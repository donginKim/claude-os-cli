/**
 * claude-os 컨텍스트 형상관리 핵심 타입 정의
 */

/** 컨텍스트 스냅샷 — 형상관리의 기본 단위 (git commit에 해당) */
export interface ContextSnapshot {
  id: string;
  parentId: string | null;
  branch: string;
  message: string;
  timestamp: string;
  author: string;
  tags: string[];
  data: ContextData;
}

/** 스냅샷에 담기는 실제 데이터 */
export interface ContextData {
  claudeMd: string | null;
  memories: Record<string, string>;
  settings: Record<string, unknown> | null;
  hooks: HookConfig[];
  projectMeta: ProjectMeta;
}

/** 프로젝트 메타데이터 */
export interface ProjectMeta {
  workingDirectory: string;
  language: string[];
  framework: string[];
  packageManager: string | null;
  testRunner: string | null;
  description: string;
}

/** Hook 설정 */
export interface HookConfig {
  event: string;
  command: string;
  description?: string;
}

/** 브랜치 정보 */
export interface BranchInfo {
  name: string;
  head: string;
  createdAt: string;
}

/** 저장소 설정 */
export interface StoreConfig {
  version: number;
  currentBranch: string;
  branches: Record<string, BranchInfo>;
}

/** 로그 엔트리 (표시용) */
export interface LogEntry {
  id: string;
  shortId: string;
  branch: string;
  message: string;
  timestamp: string;
  tags: string[];
}

/** Diff 결과 */
export interface DiffResult {
  file: string;
  changes: string;
}
