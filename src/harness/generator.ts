import type { ProjectMeta } from '../core/types.js';

/**
 * 프로젝트 메타데이터를 기반으로 CLAUDE.md 자동 생성
 */
export function generateHarness(meta: ProjectMeta): string {
  const sections: string[] = [];

  // 헤더
  sections.push(`# Project: ${meta.description || meta.workingDirectory.split('/').pop()}`);
  sections.push('');

  // 언어 & 프레임워크
  if (meta.language.length > 0) {
    sections.push(`## Tech Stack`);
    sections.push(`- Language: ${meta.language.join(', ')}`);
    if (meta.framework.length > 0) {
      sections.push(`- Framework: ${meta.framework.join(', ')}`);
    }
    if (meta.packageManager) {
      sections.push(`- Package Manager: ${meta.packageManager}`);
    }
    if (meta.testRunner) {
      sections.push(`- Test Runner: ${meta.testRunner}`);
    }
    sections.push('');
  }

  // 빌드 & 테스트 명령어
  sections.push('## Common Commands');
  if (meta.packageManager) {
    const pm = meta.packageManager;
    const run = pm === 'npm' ? 'npm run' : pm;
    sections.push(`- Install: \`${pm} install\``);
    sections.push(`- Build: \`${run} build\``);
    sections.push(`- Test: \`${run} test\``);
    sections.push(`- Lint: \`${run} lint\``);
  } else if (meta.language.includes('go')) {
    sections.push('- Build: `go build ./...`');
    sections.push('- Test: `go test ./...`');
    sections.push('- Lint: `golangci-lint run`');
  } else if (meta.language.includes('rust')) {
    sections.push('- Build: `cargo build`');
    sections.push('- Test: `cargo test`');
    sections.push('- Lint: `cargo clippy`');
  } else if (meta.language.includes('python')) {
    sections.push('- Test: `pytest`');
    sections.push('- Lint: `ruff check .`');
  }
  sections.push('');

  // 코딩 컨벤션 섹션 (사용자가 채울 수 있도록)
  sections.push('## Coding Conventions');
  sections.push('<!-- Add your team\'s coding conventions here -->');
  sections.push('');

  // 아키텍처 섹션
  sections.push('## Architecture');
  sections.push('<!-- Describe your project architecture here -->');
  sections.push('');

  return sections.join('\n');
}
