# claude-os

> AI 컨텍스트 형상관리 도구 — PC를 Claude OS로 만드세요

Claude Code의 컨텍스트(CLAUDE.md, 메모리, 설정, 훅)를 Git처럼 형상관리하고, 멀티에이전트 시스템으로 복잡한 목표를 자동으로 달성하는 도구입니다.

## 주요 기능

### 컨텍스트 형상관리

Git이 코드를 관리하듯, claude-os는 AI 대화 컨텍스트를 관리합니다.

| Git | claude-os | 설명 |
|---|---|---|
| `git commit` | `claude-os commit` | 현재 컨텍스트 스냅샷 저장 |
| `git checkout` | `claude-os checkout` | 특정 시점으로 컨텍스트 전환 |
| `git branch` | `claude-os branch` | 독립된 컨텍스트 분기 |
| `git log` | `claude-os log` | 히스토리 조회 |
| `git diff` | `claude-os diff` | 두 시점 비교 |
| `git tag` | `claude-os tag` | 중요 시점 마킹 |

### Synapse 멀티에이전트

Goal만 주면 여러 역할의 에이전트가 자동으로 소통하며 결과를 도출합니다.

```
사용자 → Goal
         │
   ┌─────▼──────┐
   │ Orchestrator│  Goal 분석 → 역할 배정
   └─────┬──────┘
         │
  ┌──────┼──────────┐
  ▼      ▼          ▼
Drafter  Reviewer  Concluder
  │      │          │
  └──────┼──────────┘
         ▼
    Synapse Bus (메시지 교환)
```

### TUI 대시보드

`claude-os dashboard`로 터미널에서 직관적으로 관리할 수 있습니다.

- 현재 상태, 브랜치 목록, 스냅샷 히스토리를 한눈에
- 키보드 단축키로 커밋, 체크아웃, 브랜치 생성, 태그 추가

## 설치

```bash
git clone https://github.com/donginKim/claude-os.git
cd claude-os
bash install.sh
```

**요구사항:** Node.js 18+

## 사용법

### 기본 — 컨텍스트 형상관리

```bash
# 초기화
claude-os init

# CLAUDE.md 자동 생성 포함 초기화
claude-os init --harness

# 스냅샷 저장
claude-os commit -m "인증 모듈 리팩토링 중간"

# 태그와 함께 저장
claude-os commit -m "v1 완성" -t release stable

# 브랜치 생성
claude-os branch feature/payment

# 히스토리 조회
claude-os log

# 다른 브랜치로 전환
claude-os checkout main

# 스냅샷을 파일시스템에 복원
claude-os checkout feature/payment --restore

# 두 스냅샷 비교
claude-os diff a3f2b7c1 d4e5f8a2

# 현재 상태 확인
claude-os status

# TUI 대시보드
claude-os dashboard
```

### Synapse — 멀티에이전트

```bash
# 기본 프리셋으로 실행 (Drafter → Reviewer → Concluder)
claude-os synapse run "에러 핸들링 전략을 수립해줘"

# 프리셋 지정
claude-os synapse run "결제 시스템 설계" --preset design

# 역할 직접 지정
claude-os synapse run "API 설계" --roles architect critic refiner concluder

# 최대 라운드 수 지정
claude-os synapse run "보안 점검" --preset thorough --max-rounds 3

# 세션 로그 저장
claude-os synapse run "코드 리뷰" --save-log review.md

# 사용 가능한 역할 목록
claude-os synapse roles

# 프리셋 목록
claude-os synapse presets
```

### 프리셋

| 프리셋 | 흐름 | 용도 |
|---|---|---|
| `default` | Drafter → Reviewer → Concluder | 일반 작업 |
| `thorough` | Drafter → Reviewer → Refiner → Concluder | 꼼꼼한 검토 |
| `design` | Architect → Critic → Refiner → Concluder | 시스템 설계 |
| `research` | Researcher → Critic → Concluder | 리서치 |
| `prompt` | Drafter → PromptEngineer → Reviewer → Concluder | 프롬프트 최적화 |

### 빌트인 역할

| 역할 | 설명 |
|---|---|
| `drafter` | 초안 작성자 |
| `reviewer` | 검토자 (승인/거절 권한) |
| `refiner` | 피드백 반영 개선자 |
| `concluder` | 최종 결론 도출자 |
| `architect` | 시스템/구조 설계자 |
| `critic` | 비평가 (승인/거절 권한) |
| `researcher` | 정보 수집/분석 연구자 |
| `promptEngineer` | 프롬프트 최적화 전문가 |

### Provider 옵션

```bash
--provider claude-code   # Claude Code CLI (기본)
--provider claude-api    # Claude API 직접 호출
--provider mock          # 테스트용
```

## 프로젝트 구조

```
claude-os/
├── src/
│   ├── cli.ts                 # CLI 진입점
│   ├── index.ts               # 라이브러리 export
│   ├── core/
│   │   ├── types.ts           # 스냅샷 스키마
│   │   ├── store.ts           # 저장소 엔진
│   │   ├── collector.ts       # 컨텍스트 수집기
│   │   └── restorer.ts        # 컨텍스트 복원기
│   ├── harness/
│   │   └── generator.ts       # CLAUDE.md 자동 생성
│   ├── synapse/
│   │   ├── orchestrator.ts    # Goal → 역할 배정 → 실행
│   │   ├── agent.ts           # AI 에이전트
│   │   ├── bus.ts             # 에이전트 간 메시지 버스
│   │   ├── protocol.ts        # 소통 프로토콜
│   │   ├── roles.ts           # 역할 & 프리셋 정의
│   │   └── types.ts           # Synapse 타입
│   └── tui/
│       └── dashboard.ts       # TUI 대시보드
├── install.sh
├── package.json
└── tsconfig.json
```

## 라이선스

MIT

---

# claude-os (English)

> AI Context Version Control — Turn your PC into a Claude OS

A tool that manages Claude Code contexts (CLAUDE.md, memories, settings, hooks) like Git, and automatically achieves complex goals through a multi-agent system.

## Key Features

### Context Version Control

Just as Git manages code, claude-os manages AI conversation contexts.

| Git | claude-os | Description |
|---|---|---|
| `git commit` | `claude-os commit` | Save current context snapshot |
| `git checkout` | `claude-os checkout` | Switch to a specific point in time |
| `git branch` | `claude-os branch` | Create independent context branches |
| `git log` | `claude-os log` | View history |
| `git diff` | `claude-os diff` | Compare two snapshots |
| `git tag` | `claude-os tag` | Mark important points |

### Synapse Multi-Agent

Just provide a goal, and multiple role-based agents automatically communicate and produce results.

```
User → Goal
        │
  ┌─────▼──────┐
  │ Orchestrator│  Analyze goal → Assign roles
  └─────┬──────┘
        │
 ┌──────┼──────────┐
 ▼      ▼          ▼
Drafter  Reviewer  Concluder
 │      │          │
 └──────┼──────────┘
        ▼
   Synapse Bus (message exchange)
```

### TUI Dashboard

Manage everything intuitively from the terminal with `claude-os dashboard`.

## Installation

```bash
git clone https://github.com/donginKim/claude-os.git
cd claude-os
bash install.sh
```

**Requirements:** Node.js 18+

## Usage

### Basics — Context Version Control

```bash
# Initialize
claude-os init

# Initialize with auto-generated CLAUDE.md
claude-os init --harness

# Save snapshot
claude-os commit -m "auth module refactoring in progress"

# Create branch
claude-os branch feature/payment

# View history
claude-os log

# Switch context
claude-os checkout main

# Restore snapshot to filesystem
claude-os checkout feature/payment --restore

# Compare snapshots
claude-os diff a3f2b7c1 d4e5f8a2

# TUI Dashboard
claude-os dashboard
```

### Synapse — Multi-Agent

```bash
# Run with default preset (Drafter → Reviewer → Concluder)
claude-os synapse run "Design an error handling strategy"

# Use a preset
claude-os synapse run "Design payment system" --preset design

# Specify roles directly
claude-os synapse run "API design" --roles architect critic refiner concluder

# Set max rounds
claude-os synapse run "Security audit" --preset thorough --max-rounds 3

# Save session log
claude-os synapse run "Code review" --save-log review.md

# List available roles and presets
claude-os synapse roles
claude-os synapse presets
```

### Presets

| Preset | Flow | Use Case |
|---|---|---|
| `default` | Drafter → Reviewer → Concluder | General tasks |
| `thorough` | Drafter → Reviewer → Refiner → Concluder | Thorough review |
| `design` | Architect → Critic → Refiner → Concluder | System design |
| `research` | Researcher → Critic → Concluder | Research |
| `prompt` | Drafter → PromptEngineer → Reviewer → Concluder | Prompt optimization |

### Built-in Roles

| Role | Description |
|---|---|
| `drafter` | Draft creator |
| `reviewer` | Reviewer (approve/reject) |
| `refiner` | Feedback-based improver |
| `concluder` | Final conclusion synthesizer |
| `architect` | System/structure designer |
| `critic` | Critic (approve/reject) |
| `researcher` | Information gatherer/analyst |
| `promptEngineer` | Prompt optimization specialist |

### Provider Options

```bash
--provider claude-code   # Claude Code CLI (default)
--provider claude-api    # Direct Claude API call
--provider mock          # For testing
```

## License

MIT
