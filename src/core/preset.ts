import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 프리셋 정의 */
export interface Preset {
  name: string;
  description: string;
  claudeMdSections: Record<string, string>;
  commands: Record<string, string>; // filename → content
  hooks: Record<string, Array<{ command: string; description?: string }>>;
}

/** 프리셋 레지스트리 */
export class PresetRegistry {
  private presets: Map<string, Preset>;

  constructor() {
    this.presets = new Map();
    this.registerBuiltins();
  }

  list(): Preset[] {
    return Array.from(this.presets.values());
  }

  get(name: string): Preset | undefined {
    return this.presets.get(name);
  }

  /** 프리셋 적용 */
  apply(name: string, cwd?: string): { applied: string[] } {
    const preset = this.presets.get(name);
    if (!preset) throw new Error(`프리셋을 찾을 수 없습니다: ${name}`);

    const dir = cwd ?? process.cwd();
    const applied: string[] = [];

    // 1. CLAUDE.md 업데이트
    const claudeMdPath = join(dir, 'CLAUDE.md');
    let claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : '';

    for (const [section, content] of Object.entries(preset.claudeMdSections)) {
      const sectionHeader = `## ${section}`;
      if (claudeMd.includes(sectionHeader)) {
        // 기존 섹션 업데이트 — 비어있으면 채움
        const regex = new RegExp(`(## ${section}\\n)(<!--[\\s\\S]*?-->\\n?)?`, 'm');
        if (regex.test(claudeMd)) {
          claudeMd = claudeMd.replace(regex, `## ${section}\n${content}\n`);
          applied.push(`CLAUDE.md: ${section} 업데이트`);
        }
      } else {
        claudeMd += `\n${sectionHeader}\n${content}\n`;
        applied.push(`CLAUDE.md: ${section} 추가`);
      }
    }

    writeFileSync(claudeMdPath, claudeMd);

    // 2. 커스텀 커맨드 생성
    if (Object.keys(preset.commands).length > 0) {
      const commandsDir = join(dir, '.claude', 'commands');
      mkdirSync(commandsDir, { recursive: true });

      for (const [filename, content] of Object.entries(preset.commands)) {
        const filePath = join(commandsDir, filename);
        if (!existsSync(filePath)) {
          writeFileSync(filePath, content);
          applied.push(`스킬: .claude/commands/${filename}`);
        }
      }
    }

    // 3. Hooks 설정
    if (Object.keys(preset.hooks).length > 0) {
      const settingsPath = join(dir, '.claude', 'settings.json');
      mkdirSync(join(dir, '.claude'), { recursive: true });

      let settings: Record<string, any> = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* */ }
      }

      if (!settings.hooks) settings.hooks = {};
      for (const [event, handlers] of Object.entries(preset.hooks)) {
        if (!settings.hooks[event]) {
          settings.hooks[event] = handlers;
          applied.push(`Hook: ${event}`);
        }
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }

    return { applied };
  }

  private registerBuiltins(): void {
    this.presets.set('fullstack-react', {
      name: 'fullstack-react',
      description: 'React + Node.js 풀스택 프로젝트',
      claudeMdSections: {
        'Coding Conventions': [
          '- React 컴포넌트는 함수형 컴포넌트 + hooks 사용',
          '- 상태관리: 로컬은 useState, 글로벌은 context 또는 zustand',
          '- API 호출: fetch 또는 axios, react-query로 캐싱',
          '- 스타일: CSS Modules 또는 styled-components',
          '- 테스트: 컴포넌트는 React Testing Library, API는 통합 테스트',
        ].join('\n'),
        'Architecture': [
          '- `src/components/` — 재사용 UI 컴포넌트',
          '- `src/pages/` — 페이지 컴포넌트 (라우팅)',
          '- `src/hooks/` — 커스텀 hooks',
          '- `src/api/` — API 클라이언트',
          '- `src/utils/` — 유틸리티 함수',
          '- `server/` — 백엔드 API 서버',
        ].join('\n'),
      },
      commands: {
        'dev.md': '# /dev\n\n개발 서버를 프론트엔드와 백엔드 모두 실행해주세요.\n\n```bash\nnpm run dev\n```\n\n실행 상태를 확인하고 문제가 있으면 알려주세요.',
        'component.md': '# /component\n\n$ARGUMENTS 이름의 React 컴포넌트를 생성해주세요.\n\n- 함수형 컴포넌트로 작성\n- Props 타입 정의 포함\n- 기본 테스트 파일도 함께 생성\n- CSS Module 파일도 생성',
        'api-endpoint.md': '# /api-endpoint\n\n$ARGUMENTS 에 대한 REST API 엔드포인트를 생성해주세요.\n\n- 라우트 핸들러\n- 입력 유효성 검사\n- 에러 핸들링\n- 기본 테스트',
      },
      hooks: {},
    });

    this.presets.set('api-server', {
      name: 'api-server',
      description: 'REST/GraphQL API 서버 프로젝트',
      claudeMdSections: {
        'Coding Conventions': [
          '- 라우트 핸들러는 controller → service → repository 계층 구조',
          '- 모든 API 응답은 일관된 형식 사용 (data, error, meta)',
          '- 입력 유효성 검사는 zod 또는 joi 사용',
          '- 에러는 커스텀 AppError 클래스로 처리',
          '- DB 쿼리는 ORM/쿼리빌더 사용, raw SQL 지양',
        ].join('\n'),
        'Architecture': [
          '- `src/routes/` — 라우트 정의',
          '- `src/controllers/` — 요청 핸들링',
          '- `src/services/` — 비즈니스 로직',
          '- `src/models/` — 데이터 모델',
          '- `src/middleware/` — 미들웨어 (auth, logging, error)',
          '- `src/config/` — 환경 설정',
        ].join('\n'),
      },
      commands: {
        'endpoint.md': '# /endpoint\n\n$ARGUMENTS 에 대한 CRUD API 엔드포인트를 생성해주세요.\n\n- Controller + Service + Route\n- 입력 유효성 검사 (zod/joi)\n- 에러 핸들링\n- 테스트 코드',
        'migrate.md': '# /migrate\n\nDB 마이그레이션을 생성하고 실행해주세요.\n\n$ARGUMENTS\n\n마이그레이션 파일 생성 후 실행 결과를 알려주세요.',
      },
      hooks: {},
    });

    this.presets.set('cli-tool', {
      name: 'cli-tool',
      description: 'CLI 도구 프로젝트',
      claudeMdSections: {
        'Coding Conventions': [
          '- CLI 파서: commander 또는 yargs 사용',
          '- 출력: chalk으로 컬러링, ora로 스피너',
          '- 에러 메시지는 사용자 친화적으로, stderr로 출력',
          '- 설정: ~/.{tool-name}/ 에 JSON으로 저장',
          '- 종료 코드: 성공=0, 에러=1, 잘못된 사용법=2',
        ].join('\n'),
        'Architecture': [
          '- `src/cli.ts` — CLI 진입점, 명령어 등록',
          '- `src/commands/` — 개별 명령어 핸들러',
          '- `src/core/` — 핵심 비즈니스 로직',
          '- `src/utils/` — 유틸리티',
        ].join('\n'),
      },
      commands: {
        'release.md': '# /release\n\n새 버전을 릴리스해주세요.\n\n1. package.json 버전 업데이트 ($ARGUMENTS)\n2. CHANGELOG 업데이트\n3. 빌드 및 테스트\n4. git tag 생성',
        'add-command.md': '# /add-command\n\n$ARGUMENTS 이름의 새 CLI 명령어를 추가해주세요.\n\n- commander/yargs 명령어 등록\n- 핸들러 함수 구현\n- 도움말 텍스트 포함\n- 기본 테스트',
      },
      hooks: {},
    });

    this.presets.set('monorepo', {
      name: 'monorepo',
      description: '모노레포 (turborepo/nx/lerna)',
      claudeMdSections: {
        'Coding Conventions': [
          '- 패키지 간 의존성은 workspace 프로토콜 사용',
          '- 공유 타입은 @scope/types 패키지에 정의',
          '- 각 패키지는 독립적으로 빌드/테스트 가능해야 함',
          '- 루트 scripts로 전체 빌드/테스트 실행',
        ].join('\n'),
        'Architecture': [
          '- `packages/` — 공유 라이브러리 패키지',
          '- `apps/` — 애플리케이션 패키지',
          '- `tooling/` — 빌드/린트 설정 공유',
        ].join('\n'),
      },
      commands: {
        'add-package.md': '# /add-package\n\n$ARGUMENTS 이름의 새 패키지를 모노레포에 추가해주세요.\n\n- package.json 생성\n- tsconfig.json 설정\n- 기본 src/index.ts\n- 빌드 스크립트 설정',
      },
      hooks: {},
    });

    this.presets.set('data-pipeline', {
      name: 'data-pipeline',
      description: '데이터 파이프라인 / ETL 프로젝트',
      claudeMdSections: {
        'Coding Conventions': [
          '- 파이프라인 단계: Extract → Transform → Load',
          '- 각 단계는 독립적으로 테스트 가능한 함수',
          '- 데이터 검증: 입출력 스키마 검증 필수',
          '- 로깅: 구조화된 JSON 로그, 처리 건수 포함',
          '- 멱등성: 같은 입력에 같은 결과, 재실행 안전',
        ].join('\n'),
        'Architecture': [
          '- `src/extractors/` — 데이터 소스 추출',
          '- `src/transformers/` — 변환 로직',
          '- `src/loaders/` — 적재 로직',
          '- `src/schemas/` — 데이터 스키마 정의',
          '- `src/pipeline/` — 파이프라인 오케스트레이션',
        ].join('\n'),
      },
      commands: {
        'run-pipeline.md': '# /run-pipeline\n\n$ARGUMENTS 파이프라인을 실행해주세요.\n\n실행 전 입력 데이터를 확인하고, 각 단계의 처리 결과를 요약해주세요.',
      },
      hooks: {},
    });
  }
}
