/**
 * Synapse 멀티에이전트 시스템 타입 정의
 */

/** 에이전트 역할 정의 */
export interface RoleDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  /** 이 역할이 수행하는 작업 유형 */
  taskType: 'draft' | 'review' | 'refine' | 'conclude' | 'custom';
  /** 이 역할이 최종 승인 권한을 가지는지 */
  canApprove: boolean;
  /** 이 역할의 실행 우선순위 (낮을수록 먼저) */
  priority: number;
}

/** 역할 프리셋 — 미리 정의된 역할 조합 */
export interface RolePreset {
  name: string;
  description: string;
  roles: RoleDefinition[];
}

/** 에이전트 간 메시지 */
export interface SynapseMessage {
  id: string;
  from: string;
  to: string | '*';
  round: number;
  type: 'proposal' | 'review' | 'revision' | 'approval' | 'rejection' | 'conclusion' | 'info';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** 에이전트 상태 */
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error';

/** 에이전트 인스턴스 정보 */
export interface AgentInstance {
  id: string;
  role: RoleDefinition;
  status: AgentStatus;
  context: string[];
}

/** Synapse 세션 설정 */
export interface SynapseConfig {
  goal: string;
  roles: RoleDefinition[];
  maxRounds: number;
  /** 자동 역할 배정 여부 */
  autoAssign: boolean;
  /** 사용할 AI provider 설정 */
  provider: ProviderConfig;
}

/** AI Provider 설정 */
export interface ProviderConfig {
  type: 'claude-code' | 'claude-api' | 'mock';
  model?: string;
  apiKey?: string;
}

/** 라운드 결과 */
export interface RoundResult {
  round: number;
  messages: SynapseMessage[];
  approved: boolean;
  summary: string;
}

/** Synapse 세션 결과 */
export interface SynapseResult {
  goal: string;
  roles: string[];
  rounds: RoundResult[];
  totalRounds: number;
  finalOutput: string;
  approved: boolean;
  snapshotId?: string;
}
