import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ContextData, HookConfig, ProjectMeta } from './types.js';

/**
 * 현재 환경에서 컨텍스트 데이터를 수집
 */
export class ContextCollector {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /** 현재 상태의 전체 컨텍스트 데이터 수집 */
  collect(): ContextData {
    return {
      claudeMd: this.readClaudeMd(),
      memories: this.readMemories(),
      settings: this.readSettings(),
      hooks: this.readHooks(),
      projectMeta: this.detectProjectMeta(),
    };
  }

  private readClaudeMd(): string | null {
    const paths = [
      join(this.cwd, 'CLAUDE.md'),
      join(this.cwd, '.claude', 'CLAUDE.md'),
    ];
    for (const p of paths) {
      if (existsSync(p)) return readFileSync(p, 'utf-8');
    }
    return null;
  }

  private readMemories(): Record<string, string> {
    const memories: Record<string, string> = {};

    // 글로벌 메모리
    const globalMemDir = join(homedir(), '.claude', 'memory');
    this.readMemoryDir(globalMemDir, memories, 'global/');

    // 프로젝트별 메모리 — 경로 기반 디렉토리 탐색
    const projectMemPatterns = [
      join(homedir(), '.claude', 'projects'),
    ];

    for (const base of projectMemPatterns) {
      if (!existsSync(base)) continue;
      // 프로젝트 디렉토리들을 탐색
      for (const dir of readdirSync(base)) {
        const memDir = join(base, dir, 'memory');
        if (existsSync(memDir)) {
          this.readMemoryDir(memDir, memories, `project/${dir}/`);
        }
      }
    }

    return memories;
  }

  private readMemoryDir(dir: string, memories: Record<string, string>, prefix: string): void {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.md')) {
        memories[`${prefix}${file}`] = readFileSync(join(dir, file), 'utf-8');
      }
    }
  }

  private readSettings(): Record<string, unknown> | null {
    const paths = [
      join(this.cwd, '.claude', 'settings.json'),
      join(homedir(), '.claude', 'settings.json'),
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        try {
          return JSON.parse(readFileSync(p, 'utf-8'));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private readHooks(): HookConfig[] {
    const settingsPath = join(this.cwd, '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return [];
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      return settings.hooks ?? [];
    } catch {
      return [];
    }
  }

  detectProjectMeta(): ProjectMeta {
    const meta: ProjectMeta = {
      workingDirectory: this.cwd,
      language: [],
      framework: [],
      packageManager: null,
      testRunner: null,
      description: '',
    };

    // package.json 감지
    const pkgPath = join(this.cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        meta.description = pkg.description ?? '';
        meta.language.push('javascript');
        if (existsSync(join(this.cwd, 'tsconfig.json'))) meta.language.push('typescript');

        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        // 프레임워크 감지
        if (allDeps['react']) meta.framework.push('react');
        if (allDeps['vue']) meta.framework.push('vue');
        if (allDeps['next']) meta.framework.push('next.js');
        if (allDeps['express']) meta.framework.push('express');
        if (allDeps['fastify']) meta.framework.push('fastify');
        if (allDeps['@nestjs/core']) meta.framework.push('nestjs');

        // 패키지 매니저
        if (existsSync(join(this.cwd, 'pnpm-lock.yaml'))) meta.packageManager = 'pnpm';
        else if (existsSync(join(this.cwd, 'yarn.lock'))) meta.packageManager = 'yarn';
        else if (existsSync(join(this.cwd, 'bun.lockb'))) meta.packageManager = 'bun';
        else meta.packageManager = 'npm';

        // 테스트 러너
        if (allDeps['jest']) meta.testRunner = 'jest';
        else if (allDeps['vitest']) meta.testRunner = 'vitest';
        else if (allDeps['mocha']) meta.testRunner = 'mocha';
        else if (pkg.scripts?.test?.includes('node --test')) meta.testRunner = 'node:test';
      } catch { /* ignore */ }
    }

    // Python 감지
    if (existsSync(join(this.cwd, 'pyproject.toml')) || existsSync(join(this.cwd, 'setup.py'))) {
      meta.language.push('python');
      if (existsSync(join(this.cwd, 'pyproject.toml'))) {
        const content = readFileSync(join(this.cwd, 'pyproject.toml'), 'utf-8');
        if (content.includes('django')) meta.framework.push('django');
        if (content.includes('fastapi')) meta.framework.push('fastapi');
        if (content.includes('flask')) meta.framework.push('flask');
        if (content.includes('pytest')) meta.testRunner = 'pytest';
      }
      meta.packageManager = existsSync(join(this.cwd, 'poetry.lock')) ? 'poetry' : 'pip';
    }

    // Go 감지
    if (existsSync(join(this.cwd, 'go.mod'))) {
      meta.language.push('go');
      meta.testRunner = 'go test';
    }

    // Rust 감지
    if (existsSync(join(this.cwd, 'Cargo.toml'))) {
      meta.language.push('rust');
      meta.testRunner = 'cargo test';
    }

    return meta;
  }
}
