#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ContextStore } from './core/store.js';
import { ContextCollector } from './core/collector.js';
import { ContextRestorer } from './core/restorer.js';
import { generateHarness } from './harness/generator.js';
import { ConversationHistory } from './core/history.js';
import { HistoryAnalyzer } from './core/analyzer.js';
import { ContextDoctor } from './core/doctor.js';
import { MemoryManager } from './core/memory-manager.js';
import { SessionExporter } from './core/exporter.js';
import { PresetRegistry } from './core/preset.js';
import { HooksManager } from './core/hooks-manager.js';
import { ContextSync } from './core/sync.js';

const program = new Command();
const store = new ContextStore();
const collector = new ContextCollector();
const restorer = new ContextRestorer();
const history = new ConversationHistory();
const analyzer = new HistoryAnalyzer();
const doctor = new ContextDoctor();
const memoryManager = new MemoryManager();
const exporter = new SessionExporter();
const presetRegistry = new PresetRegistry();
const hooksManager = new HooksManager();
const sync = new ContextSync();

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

// ── synapse ───────────────────────────────────────
const synapse = program
  .command('synapse')
  .description('멀티에이전트 Synapse 세션');

synapse
  .command('run <goal>')
  .description('Goal 기반 멀티에이전트 세션 실행')
  .option('-p, --preset <name>', '프리셋 사용 (default, thorough, design, research, prompt)')
  .option('-r, --roles <roles...>', '역할 직접 지정 (drafter, reviewer, refiner, concluder, architect, critic, researcher, promptEngineer)')
  .option('--max-rounds <n>', '최대 라운드 수', '5')
  .option('--provider <type>', 'AI provider (claude-code, claude-api, mock)', 'claude-code')
  .option('--model <model>', 'AI 모델 (claude-api 사용 시)')
  .option('--save-log <path>', '세션 로그를 파일로 저장')
  .option('--quiet', '진행 출력 없이 결과만 표시')
  .action(async (goal, opts) => {
    const { Orchestrator } = await import('./synapse/index.js');
    const config = Orchestrator.configure(goal, {
      preset: opts.preset,
      roles: opts.roles,
      maxRounds: parseInt(opts.maxRounds),
      provider: { type: opts.provider, model: opts.model },
    });
    const orchestrator = new Orchestrator(config);
    const result = await orchestrator.run(!opts.quiet);

    if (opts.saveLog) {
      await orchestrator.saveLog(opts.saveLog);
      console.log(chalk.green(`\n✓ 로그 저장: ${opts.saveLog}`));
    }
  });

synapse
  .command('roles')
  .description('사용 가능한 역할 목록')
  .action(async () => {
    const { listBuiltinRoles } = await import('./synapse/index.js');
    console.log(chalk.bold('\n사용 가능한 역할:'));
    for (const role of listBuiltinRoles()) {
      console.log(`  ${chalk.cyan(role.name.padEnd(18))} ${role.description}`);
    }
    console.log('');
  });

synapse
  .command('presets')
  .description('사용 가능한 프리셋 목록')
  .action(async () => {
    const { listPresets } = await import('./synapse/index.js');
    console.log(chalk.bold('\n사용 가능한 프리셋:'));
    for (const preset of listPresets()) {
      console.log(`  ${chalk.cyan(preset.name.padEnd(12))} ${preset.description}`);
      console.log(chalk.dim(`${''.padEnd(14)}역할: ${preset.roles.join(' → ')}`));
    }
    console.log('');
  });

// ── history ──────────────────────────────────────
program
  .command('history [session-id]')
  .description('Claude Code 대화 히스토리 조회')
  .option('-n, --limit <number>', '표시할 메시지 수')
  .option('--tools', '도구 호출 정보도 표시')
  .option('--raw', '타임스탬프 포함 원본 형식')
  .action((sessionId, opts) => {
    if (!sessionId) {
      // 세션 목록 표시
      const sessions = history.listSessions();
      if (sessions.length === 0) {
        console.log(chalk.dim('이 프로젝트의 대화 히스토리가 없습니다.'));
        return;
      }

      console.log(chalk.bold(`\n대화 세션 (${sessions.length}개)\n`));
      for (const s of sessions) {
        const branch = s.branch ? chalk.dim(` (${s.branch})`) : '';
        const time = new Date(s.timestamp).toLocaleString();
        console.log(
          `${chalk.yellow(s.shortId)} ${chalk.dim(`[${s.messageCount}msgs]`)}${branch} ${s.firstMessage}`
        );
        console.log(chalk.dim(`  ${time}`));
      }
      console.log(chalk.dim(`\n세션 상세: claude-os history <session-id>`));
      return;
    }

    // 특정 세션의 대화 내용 표시
    const messages = history.getMessages(sessionId);
    if (messages.length === 0) {
      console.log(chalk.red(`세션을 찾을 수 없습니다: ${sessionId}`));
      return;
    }

    const limit = opts.limit ? parseInt(opts.limit) : messages.length;
    const displayed = messages.slice(0, limit);

    console.log(chalk.bold(`\n대화 내용 (${displayed.length}/${messages.length} 메시지)\n`));

    for (const msg of displayed) {
      const roleLabel = msg.role === 'user'
        ? chalk.cyan.bold('[USER]')
        : chalk.green.bold('[ASSISTANT]');

      if (opts.raw && msg.timestamp) {
        const time = new Date(msg.timestamp).toLocaleString();
        console.log(chalk.dim(time));
      }

      if (msg.text) {
        console.log(`${roleLabel} ${msg.text}`);
      }

      if (opts.tools && msg.toolCalls && msg.toolCalls.length > 0) {
        console.log(chalk.dim(`  → tools: ${msg.toolCalls.join(', ')}`));
      }

      console.log('');
    }
  });

// ── analyze ──────────────────────────────────────
program
  .command('analyze')
  .description('대화 히스토리 분석 및 스킬/하네스 업데이트 제안')
  .option('--apply', '제안된 스킬/하네스를 자동 적용')
  .option('--json', 'JSON 형식으로 출력')
  .action(async (opts) => {
    const result = analyzer.analyze();

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.bold(`\n📊 히스토리 분석 결과\n`));
    console.log(`  세션: ${result.totalSessions}개 | 메시지: ${result.totalMessages}개`);

    // 자주 사용하는 명령어
    if (result.commands.length > 0) {
      console.log(chalk.bold(`\n🔧 자주 사용하는 명령어 (상위 10개)\n`));
      for (const cmd of result.commands.slice(0, 10)) {
        const bar = '█'.repeat(Math.min(cmd.count, 20));
        console.log(
          `  ${chalk.cyan(cmd.command.padEnd(30))} ${chalk.dim(`${cmd.count}회`)} ${chalk.dim(`(${cmd.sessions}세션)`)} ${chalk.yellow(bar)}`
        );
      }
    }

    // 도구 사용 통계
    if (result.tools.length > 0) {
      console.log(chalk.bold(`\n🛠  도구 사용 통계\n`));
      for (const t of result.tools.slice(0, 8)) {
        console.log(
          `  ${chalk.cyan(t.tool.padEnd(20))} ${chalk.dim(`${t.count}회`)} ${chalk.dim(`(세션당 ${t.avgPerSession}회)`)}`
        );
      }
    }

    // 워크플로우 패턴
    if (result.workflows.length > 0) {
      console.log(chalk.bold(`\n🔄 반복 워크플로우 패턴\n`));
      for (const wf of result.workflows.slice(0, 5)) {
        console.log(
          `  ${chalk.yellow(wf.sequence.join(chalk.dim(' → ')))}  ${chalk.dim(`${wf.count}회`)}`
        );
        console.log(chalk.dim(`    ${wf.description}`));
      }
    }

    // 제안
    if (result.suggestions.length > 0) {
      console.log(chalk.bold(`\n💡 제안 (${result.suggestions.length}개)\n`));
      for (const [i, s] of result.suggestions.entries()) {
        const typeLabel = s.type === 'command'
          ? chalk.magenta('[스킬]')
          : chalk.blue('[하네스]');
        console.log(`  ${chalk.dim(`${i + 1}.`)} ${typeLabel} ${chalk.bold(s.name)}`);
        console.log(chalk.dim(`     ${s.reason}`));
        if (s.type === 'command') {
          console.log(chalk.dim(`     → .claude/commands/${s.name}.md 로 등록`));
        } else {
          console.log(chalk.dim(`     → CLAUDE.md Common Commands에 추가`));
        }
        console.log('');
      }

      if (opts.apply) {
        await applyAnalysisSuggestions(result.suggestions);
      } else {
        console.log(chalk.dim(`자동 적용: claude-os analyze --apply`));
      }
    } else {
      console.log(chalk.dim('\n아직 제안할 패턴이 충분하지 않습니다. 대화가 쌓이면 다시 분석해보세요.'));
    }
  });

async function applyAnalysisSuggestions(suggestions: import('./core/analyzer.js').SkillSuggestion[]) {
  const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  let applied = 0;

  for (const s of suggestions) {
    if (s.type === 'command') {
      const dir = join(process.cwd(), '.claude', 'commands');
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, `${s.name}.md`);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, s.content);
        console.log(chalk.green(`  ✓ 스킬 생성: .claude/commands/${s.name}.md`));
        applied++;
      }
    } else if (s.type === 'harness') {
      const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
      if (existsSync(claudeMdPath)) {
        let content = readFileSync(claudeMdPath, 'utf-8');
        if (!content.includes(s.content)) {
          // Common Commands 섹션에 추가
          const marker = '## Common Commands';
          const idx = content.indexOf(marker);
          if (idx !== -1) {
            const insertPos = content.indexOf('\n\n', idx + marker.length);
            if (insertPos !== -1) {
              content = content.slice(0, insertPos) + '\n' + s.content + content.slice(insertPos);
            } else {
              content += '\n' + s.content;
            }
          } else {
            content += '\n\n## Common Commands\n' + s.content;
          }
          writeFileSync(claudeMdPath, content);
          console.log(chalk.green(`  ✓ 하네스 업데이트: ${s.name}`));
          applied++;
        }
      }
    }
  }

  console.log(chalk.green(`\n✓ ${applied}개 제안 적용 완료`));
}

// ── doctor ───────────────────────────────────────
program
  .command('doctor')
  .description('컨텍스트 건강 진단')
  .option('--json', 'JSON 형식으로 출력')
  .action((opts) => {
    const report = doctor.diagnose();

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const scoreColor = report.score >= 80 ? chalk.green : report.score >= 50 ? chalk.yellow : chalk.red;
    console.log(chalk.bold(`\n🏥 컨텍스트 건강 진단  ${scoreColor(`${report.score}점`)}\n`));

    const icons: Record<string, string> = { ok: '✓', warn: '⚠', error: '✗', missing: '✗' };
    const colors: Record<string, (s: string) => string> = {
      ok: chalk.green, warn: chalk.yellow, error: chalk.red, missing: chalk.red,
    };

    for (const section of report.sections) {
      console.log(chalk.bold(`\n  ${section.name}`));
      for (const item of section.items) {
        const icon = icons[item.status];
        const color = colors[item.status];
        console.log(`  ${color(icon)} ${item.label.padEnd(28)} ${chalk.dim(item.detail)}`);
        if (item.suggestion) {
          console.log(chalk.dim(`    → ${item.suggestion}`));
        }
      }
    }
    console.log('');
  });

// ── memory ───────────────────────────────────────
const memory = program
  .command('memory')
  .description('메모리 관리');

memory
  .command('list')
  .description('메모리 목록 조회')
  .option('--stale <days>', '지정 일수 이상 오래된 메모리만')
  .option('--type <type>', '유형 필터 (user, feedback, project, reference)')
  .action((opts) => {
    const files = memoryManager.list({
      stale: opts.stale ? parseInt(opts.stale) : undefined,
      type: opts.type,
    });

    if (files.length === 0) {
      console.log(chalk.dim('메모리가 없습니다.'));
      return;
    }

    console.log(chalk.bold(`\n메모리 (${files.length}개)\n`));
    for (const f of files) {
      const typeLabel = chalk.cyan(f.type.padEnd(12));
      const age = f.ageDays > 60 ? chalk.red(`${f.ageDays}일 전`) : chalk.dim(`${f.ageDays}일 전`);
      console.log(`  ${typeLabel} ${f.name.padEnd(35)} ${age}`);
      if (f.description) {
        console.log(chalk.dim(`             ${f.description}`));
      }
    }
    console.log('');
  });

memory
  .command('show <name>')
  .description('메모리 내용 조회')
  .action((name) => {
    const file = memoryManager.show(name);
    if (!file) {
      console.log(chalk.red(`메모리를 찾을 수 없습니다: ${name}`));
      return;
    }

    console.log(chalk.bold(`\n${file.name}`));
    console.log(chalk.dim(`유형: ${file.type} | 수정: ${file.modifiedAt.toLocaleString()} | ${file.ageDays}일 전\n`));
    console.log(file.content);
  });

memory
  .command('rm <name>')
  .description('메모리 삭제')
  .action((name) => {
    if (memoryManager.remove(name)) {
      console.log(chalk.green(`✓ 삭제됨: ${name}`));
    } else {
      console.log(chalk.red(`메모리를 찾을 수 없습니다: ${name}`));
    }
  });

memory
  .command('compact')
  .description('메모리 정리 제안')
  .action(() => {
    const suggestions = memoryManager.compact();
    if (suggestions.length === 0) {
      console.log(chalk.green('✓ 정리할 메모리가 없습니다.'));
      return;
    }

    console.log(chalk.bold(`\n정리 제안 (${suggestions.length}개)\n`));
    for (const s of suggestions) {
      const actionLabel = s.action === 'delete'
        ? chalk.red('[삭제]')
        : s.action === 'merge'
          ? chalk.yellow('[병합]')
          : chalk.blue('[수정]');
      console.log(`  ${actionLabel} ${s.files.join(', ')}`);
      console.log(chalk.dim(`    ${s.reason}`));
    }
    console.log('');
  });

// ── export ───────────────────────────────────────
program
  .command('export [session-id]')
  .description('대화 히스토리 내보내기')
  .option('-o, --output <path>', '파일로 저장')
  .option('-f, --format <format>', '형식 (markdown, html, json)', 'markdown')
  .option('--tools', '도구 호출 포함')
  .option('--timestamps', '타임스탬프 포함')
  .option('--all', '전체 세션 내보내기')
  .option('--since <days>', '최근 N일')
  .action(async (sessionId, opts) => {
    const { writeFileSync } = await import('node:fs');
    const exportOpts = {
      format: opts.format as 'markdown' | 'html' | 'json',
      includeTools: opts.tools,
      includeTimestamps: opts.timestamps,
      since: opts.since ? parseInt(opts.since) : undefined,
    };

    let output: string;
    if (opts.all || !sessionId) {
      output = exporter.exportAll(exportOpts);
    } else {
      output = exporter.exportSession(sessionId, exportOpts);
    }

    if (!output) {
      console.log(chalk.dim('내보낼 대화가 없습니다.'));
      return;
    }

    if (opts.output) {
      writeFileSync(opts.output, output);
      console.log(chalk.green(`✓ 저장됨: ${opts.output}`));
    } else {
      console.log(output);
    }
  });

// ── preset ───────────────────────────────────────
const preset = program
  .command('preset')
  .description('프로젝트 유형별 프리셋 관리');

preset
  .command('list')
  .description('사용 가능한 프리셋 목록')
  .action(() => {
    const presets = presetRegistry.list();
    console.log(chalk.bold(`\n사용 가능한 프리셋 (${presets.length}개)\n`));
    for (const p of presets) {
      console.log(`  ${chalk.cyan(p.name.padEnd(20))} ${p.description}`);
      const features: string[] = [];
      if (Object.keys(p.claudeMdSections).length > 0) features.push(`CLAUDE.md ${Object.keys(p.claudeMdSections).length}섹션`);
      if (Object.keys(p.commands).length > 0) features.push(`스킬 ${Object.keys(p.commands).length}개`);
      if (Object.keys(p.hooks).length > 0) features.push(`Hook ${Object.keys(p.hooks).length}개`);
      console.log(chalk.dim(`${''.padEnd(22)}${features.join(' | ')}`));
    }
    console.log(chalk.dim(`\n적용: claude-os preset apply <name>`));
  });

preset
  .command('apply <name>')
  .description('프리셋 적용')
  .action((name) => {
    try {
      const result = presetRegistry.apply(name);
      if (result.applied.length === 0) {
        console.log(chalk.dim('이미 적용된 항목이 없습니다.'));
        return;
      }
      console.log(chalk.green(`\n✓ 프리셋 "${name}" 적용 완료\n`));
      for (const item of result.applied) {
        console.log(chalk.dim(`  - ${item}`));
      }
      console.log('');
    } catch (e: any) {
      console.log(chalk.red(e.message));
    }
  });

preset
  .command('show <name>')
  .description('프리셋 상세 내용 보기')
  .action((name) => {
    const p = presetRegistry.get(name);
    if (!p) {
      console.log(chalk.red(`프리셋을 찾을 수 없습니다: ${name}`));
      return;
    }

    console.log(chalk.bold(`\n${p.name} — ${p.description}\n`));

    if (Object.keys(p.claudeMdSections).length > 0) {
      console.log(chalk.bold('CLAUDE.md 섹션:'));
      for (const [section, content] of Object.entries(p.claudeMdSections)) {
        console.log(chalk.cyan(`  ## ${section}`));
        for (const line of content.split('\n')) {
          console.log(chalk.dim(`    ${line}`));
        }
      }
      console.log('');
    }

    if (Object.keys(p.commands).length > 0) {
      console.log(chalk.bold('스킬:'));
      for (const filename of Object.keys(p.commands)) {
        console.log(`  ${chalk.cyan(`/${filename.replace('.md', '')}`)}`);
      }
      console.log('');
    }
  });

// ── hooks ────────────────────────────────────────
const hooks = program
  .command('hooks')
  .description('Hook 관리');

hooks
  .command('list')
  .description('현재 설정된 hooks 조회')
  .action(() => {
    const hookList = hooksManager.list();
    if (hookList.length === 0) {
      console.log(chalk.dim('설정된 hook이 없습니다. claude-os hooks templates 로 추천 목록을 확인하세요.'));
      return;
    }

    console.log(chalk.bold(`\nHooks (${hookList.length}개 이벤트)\n`));
    for (const h of hookList) {
      console.log(`  ${chalk.cyan(h.event)}`);
      for (const handler of h.handlers) {
        console.log(chalk.dim(`    → ${handler.command}`));
        if (handler.description) {
          console.log(chalk.dim(`      ${handler.description}`));
        }
      }
    }
    console.log('');
  });

hooks
  .command('add <name>')
  .description('Hook 추가 (템플릿 이름)')
  .action((name) => {
    try {
      const result = hooksManager.add(name);
      console.log(chalk.green(`✓ Hook 추가: ${result.event}`));
      console.log(chalk.dim(`  → ${result.handler.command}`));
    } catch (e: any) {
      console.log(chalk.red(e.message));
    }
  });

hooks
  .command('rm <event>')
  .description('Hook 제거')
  .action((event) => {
    if (hooksManager.remove(event)) {
      console.log(chalk.green(`✓ Hook 제거: ${event}`));
    } else {
      console.log(chalk.red(`Hook을 찾을 수 없습니다: ${event}`));
    }
  });

hooks
  .command('templates')
  .description('사용 가능한 hook 템플릿')
  .action(() => {
    const templates = hooksManager.getTemplates();
    console.log(chalk.bold(`\nHook 템플릿 (${templates.length}개)\n`));
    for (const t of templates) {
      console.log(`  ${chalk.cyan(t.name.padEnd(22))} ${t.description}`);
      console.log(chalk.dim(`${''.padEnd(24)}이벤트: ${t.event}`));
      console.log(chalk.dim(`${''.padEnd(24)}명령어: ${t.handler.command.slice(0, 60)}...`));
    }
    console.log(chalk.dim(`\n추가: claude-os hooks add <template-name>`));
  });

// ── sync ─────────────────────────────────────────
const syncCmd = program
  .command('sync')
  .description('컨텍스트 동기화 (프로젝트 간 설정 공유)');

syncCmd
  .command('export')
  .description('현재 프로젝트 컨텍스트를 번들로 내보내기')
  .requiredOption('-o, --out <path>', '출력 파일 경로')
  .action(async (opts) => {
    const { writeFileSync } = await import('node:fs');
    const bundle = sync.export();
    writeFileSync(opts.out, JSON.stringify(bundle, null, 2));

    const parts: string[] = [];
    if (bundle.claudeMd) parts.push('CLAUDE.md');
    if (Object.keys(bundle.memories).length > 0) parts.push(`메모리 ${Object.keys(bundle.memories).length}개`);
    if (Object.keys(bundle.commands).length > 0) parts.push(`스킬 ${Object.keys(bundle.commands).length}개`);
    if (bundle.hooks) parts.push('Hooks');

    console.log(chalk.green(`✓ 번들 저장: ${opts.out}`));
    console.log(chalk.dim(`  포함: ${parts.join(', ')}`));
  });

syncCmd
  .command('import <file>')
  .description('번들을 현재 프로젝트에 가져오기')
  .option('--no-claudemd', 'CLAUDE.md 제외')
  .option('--no-memories', '메모리 제외')
  .option('--no-commands', '스킬 제외')
  .option('--no-hooks', 'Hook 제외')
  .action((file, opts) => {
    try {
      const bundle = ContextSync.loadBundle(file);
      const result = sync.import(bundle, {
        claudeMd: opts.claudemd !== false,
        memories: opts.memories !== false,
        commands: opts.commands !== false,
        hooks: opts.hooks !== false,
      });

      if (result.applied.length > 0) {
        console.log(chalk.green(`\n✓ 가져오기 완료\n`));
        for (const item of result.applied) {
          console.log(chalk.green(`  ✓ ${item}`));
        }
      }

      if (result.skipped.length > 0) {
        console.log(chalk.dim(`\n건너뜀:`));
        for (const item of result.skipped) {
          console.log(chalk.dim(`  - ${item}`));
        }
      }
      console.log('');
    } catch (e: any) {
      console.log(chalk.red(e.message));
    }
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
