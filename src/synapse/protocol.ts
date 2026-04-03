import type { RoleDefinition, RoundResult, SynapseMessage } from './types.js';
import type { SynapseBus } from './bus.js';
import type { SynapseAgent } from './agent.js';

/**
 * 소통 프로토콜 — 에이전트 간 작업 순서와 합의 규칙을 관리
 *
 * 흐름:
 *   1. priority 순으로 draft/research 에이전트 실행
 *   2. review 에이전트가 검토 → APPROVE or REJECT
 *   3. REJECT 시 refine 에이전트가 수정 → 다시 review
 *   4. APPROVE 또는 maxRounds 도달 시 conclude 에이전트 실행
 */
export class Protocol {
  private bus: SynapseBus;
  private agents: SynapseAgent[];
  private maxRounds: number;

  constructor(bus: SynapseBus, agents: SynapseAgent[], maxRounds: number) {
    this.bus = bus;
    this.agents = agents;
    this.maxRounds = maxRounds;
  }

  /** 프로토콜 실행 */
  async run(goal: string, onProgress?: (event: ProgressEvent) => void): Promise<RoundResult[]> {
    const results: RoundResult[] = [];
    let approved = false;

    const drafters = this.getByType('draft');
    const reviewers = this.getByType('review');
    const refiners = this.getByType('refine');
    const concluders = this.getByType('conclude');

    for (let round = 1; round <= this.maxRounds; round++) {
      onProgress?.({ type: 'round_start', round, maxRounds: this.maxRounds });

      // ── Phase 1: Draft / Research ──
      if (round === 1) {
        for (const agent of drafters) {
          onProgress?.({ type: 'agent_start', round, agent: agent.name, phase: 'draft' });
          await agent.execute(goal, round);
          onProgress?.({ type: 'agent_done', round, agent: agent.name, phase: 'draft' });
        }
      } else {
        // 후속 라운드: Refiner가 피드백 반영
        for (const agent of refiners) {
          onProgress?.({ type: 'agent_start', round, agent: agent.name, phase: 'refine' });
          await agent.execute(goal, round);
          onProgress?.({ type: 'agent_done', round, agent: agent.name, phase: 'refine' });
        }

        // Refiner가 없으면 Drafter가 다시 수정
        if (refiners.length === 0) {
          for (const agent of drafters) {
            onProgress?.({ type: 'agent_start', round, agent: agent.name, phase: 'revise' });
            await agent.execute(goal, round);
            onProgress?.({ type: 'agent_done', round, agent: agent.name, phase: 'revise' });
          }
        }
      }

      // ── Phase 2: Review ──
      for (const agent of reviewers) {
        onProgress?.({ type: 'agent_start', round, agent: agent.name, phase: 'review' });
        await agent.execute(goal, round);
        onProgress?.({ type: 'agent_done', round, agent: agent.name, phase: 'review' });
      }

      // ── 합의 판단 ──
      const verdict = this.bus.getLastVerdict();
      approved = verdict?.type === 'approval';

      const roundMessages = this.bus.getRoundMessages(round);
      results.push({
        round,
        messages: roundMessages,
        approved,
        summary: this.summarizeRound(roundMessages),
      });

      onProgress?.({ type: 'round_end', round, approved });

      if (approved) break;
    }

    // ── Phase 3: Conclusion ──
    if (concluders.length > 0) {
      const concludeRound = results.length + 1;
      onProgress?.({ type: 'round_start', round: concludeRound, maxRounds: this.maxRounds });

      for (const agent of concluders) {
        onProgress?.({ type: 'agent_start', round: concludeRound, agent: agent.name, phase: 'conclude' });
        await agent.execute(goal, concludeRound);
        onProgress?.({ type: 'agent_done', round: concludeRound, agent: agent.name, phase: 'conclude' });
      }

      const concludeMessages = this.bus.getRoundMessages(concludeRound);
      results.push({
        round: concludeRound,
        messages: concludeMessages,
        approved: true,
        summary: 'Final conclusion',
      });
    }

    return results;
  }

  private getByType(type: RoleDefinition['taskType']): SynapseAgent[] {
    return this.agents
      .filter(a => a.instance.role.taskType === type)
      .sort((a, b) => a.instance.role.priority - b.instance.role.priority);
  }

  private summarizeRound(messages: SynapseMessage[]): string {
    const types = messages.map(m => `${m.from}(${m.type})`);
    return types.join(' → ');
  }
}

/** 진행 이벤트 타입 */
export interface ProgressEvent {
  type: 'round_start' | 'round_end' | 'agent_start' | 'agent_done';
  round: number;
  maxRounds?: number;
  agent?: string;
  phase?: string;
  approved?: boolean;
}
