#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ContextStore } from './core/store.js';
import { ContextCollector } from './core/collector.js';
import { ContextRestorer } from './core/restorer.js';
import { generateHarness } from './harness/generator.js';

const program = new Command();
const store = new ContextStore();
const collector = new ContextCollector();
const restorer = new ContextRestorer();

program
  .name('claude-os')
  .description('Context version control for Claude Code')
  .version('0.1.0');

// ── init ──────────────────────────────────────────
program
  .command('init')
  .description('claude-os 저장소 및 프로젝트 하네스 초기화')
  .option('--harness', 'CLAUDE.md 자동 생성 포함')
  .action(async (opts) => {
    store.init();
    console.log(chalk.green('✓ claude-os 저장소가 초기화되었습니다.'));
    console.log(chalk.dim(`  저장소: ${store.getRoot()}`));

    if (opts.harness) {
      const { writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const meta = collector.detectProjectMeta();
      const claudeMd = generateHarness(meta);
      writeFileSync(join(process.cwd(), 'CLAUDE.md'), claudeMd);
      console.log(chalk.green('✓ CLAUDE.md가 생성되었습니다.'));
    }
  });

// ── commit ────────────────────────────────────────
program
  .command('commit')
  .description('현재 컨텍스트 스냅샷 저장')
  .requiredOption('-m, --message <message>', '커밋 메시지')
  .option('-t, --tag <tags...>', '태그 추가')
  .action((opts) => {
    const data = collector.collect();
    const snapshot = store.commit(opts.message, data, opts.tag ?? []);
    console.log(chalk.green(`✓ 스냅샷 저장: ${chalk.bold(snapshot.id.slice(0, 8))}`));
    console.log(chalk.dim(`  브랜치: ${snapshot.branch}`));
    console.log(chalk.dim(`  메시지: ${snapshot.message}`));
    if (snapshot.tags.length > 0) {
      console.log(chalk.dim(`  태그: ${snapshot.tags.join(', ')}`));
    }
  });

// ── checkout ──────────────────────────────────────
program
  .command('checkout <target>')
  .description('브랜치 또는 스냅샷으로 컨텍스트 전환')
  .option('--restore', '파일시스템에 실제 복원')
  .action((target, opts) => {
    const snapshot = store.checkout(target);
    console.log(chalk.green(`✓ 체크아웃: ${chalk.bold(target)}`));
    console.log(chalk.dim(`  스냅샷: ${snapshot.id.slice(0, 8)}`));
    console.log(chalk.dim(`  메시지: ${snapshot.message}`));

    if (opts.restore) {
      const restored = restorer.restore(snapshot);
      console.log(chalk.green(`\n✓ ${restored.length}개 파일 복원됨:`));
      for (const f of restored) {
        console.log(chalk.dim(`  - ${f}`));
      }
    }
  });

// ── log ───────────────────────────────────────────
program
  .command('log')
  .description('스냅샷 히스토리 조회')
  .option('-n, --limit <number>', '표시할 개수', '10')
  .action((opts) => {
    const entries = store.log(parseInt(opts.limit));
    if (entries.length === 0) {
      console.log(chalk.dim('스냅샷이 없습니다. "claude-os commit"으로 첫 스냅샷을 만드세요.'));
      return;
    }

    for (const entry of entries) {
      const tags = entry.tags.length > 0 ? chalk.yellow(` [${entry.tags.join(', ')}]`) : '';
      console.log(
        `${chalk.yellow(entry.shortId)} ${chalk.dim(`(${entry.branch})`)} ${entry.message}${tags}`
      );
      console.log(chalk.dim(`  ${new Date(entry.timestamp).toLocaleString()}`));
    }
  });

// ── diff ──────────────────────────────────────────
program
  .command('diff <idA> <idB>')
  .description('두 스냅샷 비교')
  .action((idA, idB) => {
    const results = store.diff(idA, idB);
    if (results.length === 0) {
      console.log(chalk.dim('변경 사항이 없습니다.'));
      return;
    }

    for (const r of results) {
      console.log(chalk.bold(`\n── ${r.file} ──`));
      for (const line of r.changes.split('\n')) {
        if (line.startsWith('+')) console.log(chalk.green(line));
        else if (line.startsWith('-')) console.log(chalk.red(line));
        else console.log(line);
      }
    }
  });

// ── branch ────────────────────────────────────────
program
  .command('branch [name]')
  .description('브랜치 생성 또는 목록 조회')
  .action((name) => {
    if (name) {
      const branch = store.createBranch(name);
      console.log(chalk.green(`✓ 브랜치 생성 및 전환: ${chalk.bold(branch.name)}`));
    } else {
      const { branches, current } = store.listBranches();
      for (const b of branches) {
        const marker = b.name === current ? chalk.green('* ') : '  ';
        const head = b.head ? chalk.dim(` (${b.head.slice(0, 8)})`) : chalk.dim(' (empty)');
        console.log(`${marker}${b.name}${head}`);
      }
    }
  });

// ── tag ───────────────────────────────────────────
program
  .command('tag <snapshot-id> <tag-name>')
  .description('스냅샷에 태그 추가')
  .action((snapshotId, tagName) => {
    store.tag(snapshotId, tagName);
    console.log(chalk.green(`✓ 태그 "${tagName}" → ${snapshotId.slice(0, 8)}`));
  });

// ── dashboard ─────────────────────────────────────
program
  .command('dashboard')
  .alias('ui')
  .description('TUI 대시보드 실행')
  .action(async () => {
    const { Dashboard } = await import('./tui/dashboard.js');
    const dashboard = new Dashboard();
    dashboard.start();
  });

// ── status ────────────────────────────────────────
program
  .command('status')
  .description('현재 상태 조회')
  .action(() => {
    try {
      const config = store.getConfig();
      const { branches, current } = store.listBranches();
      console.log(chalk.bold('claude-os status'));
      console.log(`  브랜치: ${chalk.green(current)}`);
      console.log(`  총 브랜치: ${branches.length}개`);

      const head = config.branches[current]?.head;
      if (head) {
        const snapshot = store.getSnapshot(head);
        if (snapshot) {
          console.log(`  최신 스냅샷: ${chalk.yellow(head.slice(0, 8))} — ${snapshot.message}`);
          console.log(chalk.dim(`  ${new Date(snapshot.timestamp).toLocaleString()}`));
        }
      } else {
        console.log(chalk.dim('  스냅샷 없음'));
      }
    } catch (e: any) {
      console.log(chalk.red(e.message));
    }
  });

program.parse();
