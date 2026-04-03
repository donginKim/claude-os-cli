import { randomUUID } from 'node:crypto';
import type { RoleDefinition, AgentInstance, AgentStatus, ProviderConfig } from './types.js';
import type { SynapseBus } from './bus.js';

/**
 * Synapse Agent — 역할 기반 AI 에이전트
 */
export class SynapseAgent {
  readonly instance: AgentInstance;
  private bus: SynapseBus;
  private provider: ProviderConfig;
  private inbox: string[] = [];

  constructor(role: RoleDefinition, bus: SynapseBus, provider: ProviderConfig) {
    this.instance = {
      id: randomUUID(),
      role,
      status: 'idle',
      context: [],
    };
    this.bus = bus;
    this.provider = provider;

    // 메시지 수신 등록
    bus.subscribe(role.name, (msg) => {
      this.inbox.push(msg.content);
      this.instance.context.push(`[${msg.from}→${role.name}] ${msg.content}`);
    });
  }

  get name(): string {
    return this.instance.role.name;
  }

  get status(): AgentStatus {
    return this.instance.status;
  }

  /** 에이전트 실행: 주어진 프롬프트로 작업 수행 */
  async execute(userPrompt: string, round: number): Promise<string> {
    this.instance.status = 'working';

    try {
      const contextBlock = this.instance.context.length > 0
        ? `\n\n## Previous Messages\n${this.instance.context.join('\n\n')}`
        : '';

      const fullPrompt = `${this.instance.role.systemPrompt}\n\n## Goal\n${userPrompt}${contextBlock}`;

      const result = await this.callProvider(fullPrompt);

      this.instance.context.push(`[${this.name} output] ${result}`);
      this.instance.status = 'done';

      // 결과를 메시지 타입에 맞게 bus에 전송
      const msgType = this.resolveMessageType(result);
      this.bus.send(this.name, '*', msgType, result, round);

      return result;
    } catch (e: any) {
      this.instance.status = 'error';
      throw e;
    }
  }

  /** 메시지 타입 결정 */
  private resolveMessageType(output: string): 'proposal' | 'review' | 'revision' | 'approval' | 'rejection' | 'conclusion' {
    const role = this.instance.role;

    if (role.taskType === 'conclude') return 'conclusion';
    if (role.taskType === 'refine') return 'revision';

    if (role.canApprove) {
      const upper = output.toUpperCase();
      if (upper.includes('[APPROVE]')) return 'approval';
      if (upper.includes('[REJECT]')) return 'rejection';
      return 'review';
    }

    return 'proposal';
  }

  /** AI Provider 호출 */
  private async callProvider(prompt: string): Promise<string> {
    switch (this.provider.type) {
      case 'claude-code':
        return this.callClaudeCode(prompt);
      case 'claude-api':
        return this.callClaudeAPI(prompt);
      case 'mock':
        return this.callMock(prompt);
      default:
        throw new Error(`Unknown provider: ${this.provider.type}`);
    }
  }

  /** claude-code CLI를 subprocess로 호출 */
  private async callClaudeCode(prompt: string): Promise<string> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    try {
      const { stdout } = await exec('claude', ['-p', prompt, '--no-input'], {
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 10,
      });
      return stdout.trim();
    } catch (e: any) {
      throw new Error(`Claude Code 호출 실패: ${e.message}`);
    }
  }

  /** Claude API 직접 호출 */
  private async callClaudeAPI(prompt: string): Promise<string> {
    const apiKey = this.provider.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');

    const model = this.provider.model ?? 'claude-sonnet-4-6';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API 오류 (${res.status}): ${body}`);
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text ?? '';
  }

  /** Mock provider (테스트/개발용) */
  private async callMock(prompt: string): Promise<string> {
    const role = this.instance.role;

    await new Promise(r => setTimeout(r, 100));

    if (role.canApprove) {
      const hasContext = this.instance.context.length > 2;
      if (hasContext) {
        return `[${role.name} Review]\n\n검토 완료. 전반적으로 잘 구성되어 있습니다.\n\n[APPROVE] 목표에 부합하는 결과물입니다.`;
      }
      return `[${role.name} Review]\n\n초안을 검토했습니다.\n\n개선 필요 사항:\n1. 구체적인 예시 추가 필요\n2. 엣지케이스 고려 부족\n\n[REJECT] 위 사항을 반영해주세요.`;
    }

    if (role.taskType === 'conclude') {
      return `[${role.name} Conclusion]\n\n## 최종 결과 요약\n\n모든 라운드의 논의를 종합한 결과입니다.\n\n### 핵심 결론\n- Goal에 대한 종합적인 결론이 도출되었습니다.\n\n### 실행 계획\n1. 단계별 실행 항목 정리`;
    }

    if (role.taskType === 'refine') {
      return `[${role.name} Revision]\n\n피드백을 반영하여 수정했습니다.\n\n### 변경 사항\n1. 구체적 예시 추가\n2. 엣지케이스 처리 방안 보완`;
    }

    return `[${role.name} Draft]\n\n## Goal 분석\n\n주어진 목표를 분석하고 초안을 작성했습니다.\n\n### 제안\n1. 핵심 접근 방식 정의\n2. 구현 단계 설계\n3. 검증 계획 수립`;
  }
}
