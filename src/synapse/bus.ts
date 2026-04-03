import { randomUUID } from 'node:crypto';
import type { SynapseMessage } from './types.js';

type MessageHandler = (message: SynapseMessage) => void;

/**
 * Synapse Bus — 에이전트 간 메시지 전달 시스템
 */
export class SynapseBus {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private history: SynapseMessage[] = [];

  /** 메시지 발행 */
  send(
    from: string,
    to: string | '*',
    type: SynapseMessage['type'],
    content: string,
    round: number,
    metadata?: Record<string, unknown>,
  ): SynapseMessage {
    const message: SynapseMessage = {
      id: randomUUID(),
      from,
      to,
      round,
      type,
      content,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.history.push(message);

    // broadcast
    if (to === '*') {
      for (const [agent, handlers] of this.handlers) {
        if (agent !== from) {
          handlers.forEach(h => h(message));
        }
      }
    } else {
      const handlers = this.handlers.get(to) ?? [];
      handlers.forEach(h => h(message));
    }

    return message;
  }

  /** 특정 에이전트의 메시지 구독 */
  subscribe(agentName: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(agentName) ?? [];
    handlers.push(handler);
    this.handlers.set(agentName, handlers);
  }

  /** 전체 메시지 히스토리 */
  getHistory(): SynapseMessage[] {
    return [...this.history];
  }

  /** 특정 라운드의 메시지 */
  getRoundMessages(round: number): SynapseMessage[] {
    return this.history.filter(m => m.round === round);
  }

  /** 특정 에이전트가 보낸 메시지 */
  getMessagesFrom(agentName: string): SynapseMessage[] {
    return this.history.filter(m => m.from === agentName);
  }

  /** 특정 에이전트에게 온 메시지 */
  getMessagesTo(agentName: string): SynapseMessage[] {
    return this.history.filter(m => m.to === agentName || m.to === '*');
  }

  /** 마지막 승인/거절 메시지 찾기 */
  getLastVerdict(): SynapseMessage | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const msg = this.history[i];
      if (msg.type === 'approval' || msg.type === 'rejection') {
        return msg;
      }
    }
    return null;
  }

  /** 히스토리를 읽기 좋은 문자열로 변환 */
  formatHistory(round?: number): string {
    const msgs = round !== undefined ? this.getRoundMessages(round) : this.history;
    return msgs.map(m => {
      const arrow = m.to === '*' ? '→ ALL' : `→ ${m.to}`;
      return `[${m.from} ${arrow}] (${m.type}) ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`;
    }).join('\n\n');
  }

  /** 히스토리 초기화 */
  clear(): void {
    this.history = [];
    this.handlers.clear();
  }
}
