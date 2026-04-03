import chalk from 'chalk';
import { SynapseBus } from './bus.js';
import { SynapseAgent } from './agent.js';
import { Protocol } from './protocol.js';
import type { ProgressEvent } from './protocol.js';
import { getPreset, getBuiltinRole, createCustomRole } from './roles.js';
import { ContextStore } from '../core/store.js';
import { ContextCollector } from '../core/collector.js';
import type { SynapseConfig, SynapseResult, RoleDefinition, ProviderConfig } from './types.js';

/**
 * Orchestrator — Goal을 받아 역할 배정 → 프로토콜 실행 → 결과 도출
 */
export class Orchestrator {
  private config: SynapseConfig;
  private bus: SynapseBus;
  private agents: SynapseAgent[] = [];
  private store: ContextStore;
  private collector: ContextCollector;

  constructor(config: SynapseConfig) {
    this.config = config;
    this.bus = new SynapseBus();
    this.store = new ContextStore();
    this.collector = new ContextCollector();
  }

  /**
   * 설정 빌더 — 다양한 방식으로 역할을 구성
   */
  static configure(goal: string, options: {
    /** 프리셋 이름 (default, thorough, design, research, prompt) */
    preset?: string;
    /** 빌트인 역할 이름 배열 */
    roles?: string[];
    /** 커스텀 역할 정의 배열 */
    customRoles?: { name: string; description: string; prompt: string; type?: string; canApprove?: boolean }[];
    /** 최대 라운드 수 */
    maxRounds?: number;
    /** AI provider */
    provider?: ProviderConfig;
  } = {}): SynapseConfig {
    let roles: RoleDefinition[] = [];

    // 1. 프리셋에서 역할 로드
    if (options.preset) {
      const preset = getPreset(options.preset);
      if (!preset) throw new Error(`프리셋을 찾을 수 없습니다: ${options.preset}`);
      roles = [...preset.roles];
    }

    // 2. 빌트인 역할 이름으로 추가
    if (options.roles && options.roles.length > 0) {
      roles = []; // 직접 지정 시 프리셋 덮어씀
      for (const name of options.roles) {
        const role = getBuiltinRole(name);
        if (!role) throw new Error(`역할을 찾을 수 없습니다: ${name}. 사용 가능: drafter, reviewer, refiner, concluder, architect, critic, researcher, promptEngineer`);
        roles.push(role);
      }
    }

    // 3. 커스텀 역할 추가
    if (options.customRoles) {
      for (const cr of options.customRoles) {
        const role = createCustomRole(cr.name, cr.description, cr.prompt, {
          taskType: (cr.type as RoleDefinition['taskType']) ?? 'custom',
          canApprove: cr.canApprove ?? false,
        });
        roles.push(role);
      }
    }

    // 4. 아무것도 지정 안 했으면 default 프리셋
    if (roles.length === 0) {
      const preset = getPreset('default')!;
      roles = [...preset.roles];
    }

    return {
      goal,
      roles,
      maxRounds: options.maxRounds ?? 5,
      autoAssign: !options.roles && !options.customRoles,
      provider: options.provider ?? { type: 'claude-code' },
    };
  }

  /** 세션 실행 */
  async run(verbose = true): Promise<SynapseResult> {
    const { goal, roles, maxRounds, provider } = this.config;

    // 에이전트 생성
    this.agents = roles.map(role => new SynapseAgent(role, this.bus, provider));

    if (verbose) {
      console.log(chalk.bold('\n◆ Synapse Session'));
      console.log(chalk.cyan(`  Goal: ${goal}`));
      console.log(chalk.dim(`  Roles: ${roles.map(r => r.name).join(' → ')}`));
      console.log(chalk.dim(`  Max Rounds: ${maxRounds}`));
      console.log(chalk.dim(`  Provider: ${provider.type}`));
      console.log('');
    }

    // 프로토콜 실행
    const protocol = new Protocol(this.bus, this.agents, maxRounds);

    const progressHandler = verbose ? (event: ProgressEvent) => {
      switch (event.type) {
        case 'round_start':
          console.log(chalk.yellow(`\n── Round ${event.round}/${event.maxRounds} ──`));
          break;
        case 'agent_start':
          process.stdout.write(chalk.dim(`  ${event.agent} (${event.phase})... `));
          break;
        case 'agent_done':
          console.log(chalk.green('done'));
          break;
        case 'round_end':
          if (event.approved) {
            console.log(chalk.green('  ✓ Approved'));
          } else {
            console.log(chalk.red('  ✗ Rejected — next round'));
          }
          break;
      }
    } : undefined;

    const rounds = await protocol.run(goal, progressHandler);

    // 최종 출력 추출
    const allMessages = this.bus.getHistory();
    const lastConclusion = [...allMessages].reverse().find(m => m.type === 'conclusion');
    const lastApproval = [...allMessages].reverse().find(m => m.type === 'approval');
    const finalOutput = lastConclusion?.content ?? lastApproval?.content ?? allMessages[allMessages.length - 1]?.content ?? '';

    // 컨텍스트 스냅샷 저장
    let snapshotId: string | undefined;
    try {
      this.store.getConfig(); // 초기화 여부 확인
      const data = this.collector.collect();
      const snapshot = this.store.commit(
        `synapse: ${goal.slice(0, 60)}`,
        data,
        ['synapse', ...roles.map(r => r.name.toLowerCase())],
      );
      snapshotId = snapshot.id;
    } catch {
      // 저장소 미초기화 시 무시
    }

    const result: SynapseResult = {
      goal,
      roles: roles.map(r => r.name),
      rounds,
      totalRounds: rounds.length,
      finalOutput,
      approved: rounds.some(r => r.approved),
      snapshotId,
    };

    if (verbose) {
      console.log(chalk.bold('\n◆ Result'));
      console.log(chalk.dim(`  Rounds: ${result.totalRounds}`));
      console.log(chalk.dim(`  Approved: ${result.approved ? chalk.green('Yes') : chalk.red('No')}`));
      if (snapshotId) {
        console.log(chalk.dim(`  Snapshot: ${snapshotId.slice(0, 8)}`));
      }
      console.log(chalk.bold('\n── Final Output ──\n'));
      console.log(finalOutput);
    }

    return result;
  }

  /** 세션 로그를 파일로 저장 */
  async saveLog(outputPath: string): Promise<void> {
    const { writeFileSync } = await import('node:fs');
    const history = this.bus.getHistory();
    const log = history.map(m => {
      return `## [${m.from} → ${m.to}] Round ${m.round} (${m.type})\n_${m.timestamp}_\n\n${m.content}\n`;
    }).join('\n---\n\n');

    const header = `# Synapse Session Log\n\n**Goal:** ${this.config.goal}\n**Roles:** ${this.config.roles.map(r => r.name).join(', ')}\n**Date:** ${new Date().toISOString()}\n\n---\n\n`;

    writeFileSync(outputPath, header + log);
  }
}
