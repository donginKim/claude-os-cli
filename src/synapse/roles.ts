import type { RoleDefinition, RolePreset } from './types.js';

// ──────────────────────────────────────────────────
// 기본 역할 정의
// ──────────────────────────────────────────────────

export const BUILTIN_ROLES: Record<string, RoleDefinition> = {
  drafter: {
    name: 'Drafter',
    description: '초안 작성자 — Goal에 대한 첫 번째 결과물을 생성',
    systemPrompt: `You are a Drafter agent. Your job is to produce the first draft based on the given goal.
- Be thorough and structured in your output
- Consider edge cases and practical constraints
- Output should be actionable and concrete
- Format your response clearly with sections if needed`,
    taskType: 'draft',
    canApprove: false,
    priority: 1,
  },

  reviewer: {
    name: 'Reviewer',
    description: '검토자 — 결과물의 품질, 정확성, 완성도를 검증',
    systemPrompt: `You are a Reviewer agent. Your job is to critically review proposals and drafts.
- Identify logical errors, gaps, and weaknesses
- Check for completeness and accuracy
- Suggest specific improvements with clear reasoning
- Rate the quality: APPROVE if satisfactory, REJECT with specific feedback if not
- Always end with either [APPROVE] or [REJECT] followed by reasoning`,
    taskType: 'review',
    canApprove: true,
    priority: 2,
  },

  refiner: {
    name: 'Refiner',
    description: '개선자 — 피드백을 반영하여 결과물을 수정/보완',
    systemPrompt: `You are a Refiner agent. Your job is to improve drafts based on review feedback.
- Address every issue raised by the reviewer
- Preserve the strengths of the original draft
- Clearly mark what was changed and why
- Ensure the refined version is strictly better than the original`,
    taskType: 'refine',
    canApprove: false,
    priority: 3,
  },

  concluder: {
    name: 'Concluder',
    description: '결론 도출자 — 최종 결과를 정리하고 요약',
    systemPrompt: `You are a Concluder agent. Your job is to synthesize all discussion into a final deliverable.
- Combine the best elements from all rounds
- Create a clear, well-structured final document
- Include an executive summary at the top
- Ensure the conclusion directly addresses the original goal`,
    taskType: 'conclude',
    canApprove: false,
    priority: 10,
  },

  architect: {
    name: 'Architect',
    description: '설계자 — 시스템/구조 설계 초안 작성',
    systemPrompt: `You are an Architect agent. Your job is to design systems and structures.
- Consider scalability, maintainability, and simplicity
- Provide clear diagrams or structured descriptions
- Justify design decisions with trade-off analysis
- Consider failure modes and edge cases`,
    taskType: 'draft',
    canApprove: false,
    priority: 1,
  },

  critic: {
    name: 'Critic',
    description: '비평가 — 약점, 리스크, 대안을 제시',
    systemPrompt: `You are a Critic agent. Your job is to find weaknesses and propose alternatives.
- Challenge assumptions and identify risks
- Propose concrete alternatives for each weakness found
- Prioritize issues by severity and likelihood
- Be constructive — criticism should lead to improvement
- Always end with either [APPROVE] or [REJECT] followed by reasoning`,
    taskType: 'review',
    canApprove: true,
    priority: 2,
  },

  researcher: {
    name: 'Researcher',
    description: '연구자 — 관련 정보 수집 및 분석',
    systemPrompt: `You are a Researcher agent. Your job is to gather and analyze relevant information.
- Provide factual, well-organized information
- Cite sources or reasoning for claims
- Identify knowledge gaps and uncertainties
- Present findings in a structured format`,
    taskType: 'draft',
    canApprove: false,
    priority: 0,
  },

  promptEngineer: {
    name: 'PromptEngineer',
    description: '프롬프트 엔지니어 — 프롬프트를 최적화하고 재설정',
    systemPrompt: `You are a Prompt Engineer agent. Your job is to optimize and restructure prompts.
- Analyze the clarity and effectiveness of given prompts
- Restructure for better AI comprehension and output quality
- Add constraints, examples, and formatting guidelines
- Test edge cases in prompt interpretation`,
    taskType: 'refine',
    canApprove: false,
    priority: 1,
  },
};

// ──────────────────────────────────────────────────
// 프리셋 — 자주 쓰는 역할 조합
// ──────────────────────────────────────────────────

export const PRESETS: Record<string, RolePreset> = {
  default: {
    name: 'default',
    description: '기본 — 작성자 → 검토자 → 결론 도출',
    roles: [BUILTIN_ROLES.drafter, BUILTIN_ROLES.reviewer, BUILTIN_ROLES.concluder],
  },

  thorough: {
    name: 'thorough',
    description: '꼼꼼 — 작성 → 검토 → 개선 → 재검토 → 결론',
    roles: [
      BUILTIN_ROLES.drafter,
      BUILTIN_ROLES.reviewer,
      BUILTIN_ROLES.refiner,
      BUILTIN_ROLES.concluder,
    ],
  },

  design: {
    name: 'design',
    description: '설계 — 설계자 → 비평가 → 개선자 → 결론',
    roles: [
      BUILTIN_ROLES.architect,
      BUILTIN_ROLES.critic,
      BUILTIN_ROLES.refiner,
      BUILTIN_ROLES.concluder,
    ],
  },

  research: {
    name: 'research',
    description: '리서치 — 연구자 → 비평가 → 결론',
    roles: [
      BUILTIN_ROLES.researcher,
      BUILTIN_ROLES.critic,
      BUILTIN_ROLES.concluder,
    ],
  },

  prompt: {
    name: 'prompt',
    description: '프롬프트 최적화 — 작성 → 프롬프트 엔지니어 → 검토 → 결론',
    roles: [
      BUILTIN_ROLES.drafter,
      BUILTIN_ROLES.promptEngineer,
      BUILTIN_ROLES.reviewer,
      BUILTIN_ROLES.concluder,
    ],
  },
};

/** 역할 이름으로 빌트인 역할 찾기 */
export function getBuiltinRole(name: string): RoleDefinition | null {
  const key = name.toLowerCase();
  return BUILTIN_ROLES[key] ?? null;
}

/** 프리셋 이름으로 역할 조합 가져오기 */
export function getPreset(name: string): RolePreset | null {
  return PRESETS[name.toLowerCase()] ?? null;
}

/** 커스텀 역할 생성 */
export function createCustomRole(
  name: string,
  description: string,
  systemPrompt: string,
  options?: {
    taskType?: RoleDefinition['taskType'];
    canApprove?: boolean;
    priority?: number;
  }
): RoleDefinition {
  return {
    name,
    description,
    systemPrompt,
    taskType: options?.taskType ?? 'custom',
    canApprove: options?.canApprove ?? false,
    priority: options?.priority ?? 5,
  };
}

/** 사용 가능한 역할 목록 */
export function listBuiltinRoles(): { name: string; description: string }[] {
  return Object.entries(BUILTIN_ROLES).map(([key, role]) => ({
    name: key,
    description: role.description,
  }));
}

/** 사용 가능한 프리셋 목록 */
export function listPresets(): { name: string; description: string; roles: string[] }[] {
  return Object.entries(PRESETS).map(([key, preset]) => ({
    name: key,
    description: preset.description,
    roles: preset.roles.map(r => r.name),
  }));
}
