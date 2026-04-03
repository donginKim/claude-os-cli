# claude-os

> AI 컨텍스트 형상관리 도구 — PC를 Claude OS화

Claude Code의 컨텍스트(CLAUDE.md, 메모리, 설정, 훅)를 Git처럼 형상관리하고, 멀티에이전트 시스템으로 복잡한 목표를 자동으로 달성하는 도구

## 주요 기능

### 컨텍스트 형상관리

Git이 코드를 관리하듯, claude-os는 AI 대화 컨텍스트를 관리

| Git | claude-os | 설명 |
|---|---|---|
| `git commit` | `claude-os commit` | 현재 컨텍스트 스냅샷 저장 |
| `git checkout` | `claude-os checkout` | 특정 시점으로 컨텍스트 전환 |
| `git branch` | `claude-os branch` | 독립된 컨텍스트 분기 |
| `git log` | `claude-os log` | 히스토리 조회 |
| `git diff` | `claude-os diff` | 두 시점 비교 |
| `git tag` | `claude-os tag` | 중요 시점 마킹 |

### Synapse 멀티에이전트

Goal만 주면 여러 역할의 에이전트가 자동으로 소통하며 결과를 도출

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

### 대화 히스토리 & 분석

Claude Code 대화 기록을 조회하고, 반복 패턴을 분석해 스킬로 등록 제안

```bash
claude-os history                    # 세션 목록
claude-os history <session-id>       # 대화 내용 보기
claude-os analyze                    # 패턴 분석 및 스킬 제안
claude-os export <session-id> -o out.md  # Markdown/HTML 내보내기
```

### 컨텍스트 관리 도구

| 명령어 | 설명 |
|---|---|
| `claude-os doctor` | 컨텍스트 건강 진단 (CLAUDE.md, 메모리, Hook, MCP 점검) |
| `claude-os memory list` | 메모리 조회/삭제/정리 제안 |
| `claude-os preset apply <name>` | 프로젝트 유형별 원클릭 세팅 |
| `claude-os hooks add <template>` | Hook 템플릿 관리 |
| `claude-os sync export -o bundle.json` | 프로젝트 간 컨텍스트 이식 |

#### 프리셋

| 프리셋 | 설명 |
|---|---|
| `fullstack-react` | React + Node.js 풀스택 |
| `api-server` | REST/GraphQL API 서버 |
| `cli-tool` | CLI 도구 |
| `monorepo` | 모노레포 (turborepo/nx/lerna) |
| `data-pipeline` | 데이터 파이프라인 / ETL |

### TUI 대시보드

`claude-os dashboard`로 터미널에서 직관적으로 관리 가능

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
│   │   ├── restorer.ts        # 컨텍스트 복원기
│   │   ├── history.ts         # 대화 히스토리 파서
│   │   ├── analyzer.ts        # 히스토리 분석 & 스킬 제안
│   │   ├── doctor.ts          # 컨텍스트 건강 진단
│   │   ├── memory-manager.ts  # 메모리 관리
│   │   ├── exporter.ts        # 세션 내보내기
│   │   ├── preset.ts          # 프로젝트 프리셋
│   │   ├── hooks-manager.ts   # Hook 템플릿 관리
│   │   └── sync.ts            # 컨텍스트 동기화
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

## Contributors

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

## 라이선스

MIT
