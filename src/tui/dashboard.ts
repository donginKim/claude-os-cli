import blessed from 'blessed';
import { ContextStore } from '../core/store.js';
import { ContextCollector } from '../core/collector.js';
import { ContextRestorer } from '../core/restorer.js';
import type { LogEntry } from '../core/types.js';

export class Dashboard {
  private screen: blessed.Widgets.Screen;
  private store: ContextStore;
  private collector: ContextCollector;
  private restorer: ContextRestorer;

  // 패널
  private header!: blessed.Widgets.BoxElement;
  private statusBox!: blessed.Widgets.BoxElement;
  private logList!: blessed.Widgets.ListElement;
  private branchList!: blessed.Widgets.ListElement;
  private detailBox!: blessed.Widgets.BoxElement;
  private helpBar!: blessed.Widgets.BoxElement;
  private inputDialog!: blessed.Widgets.PromptElement;

  private entries: LogEntry[] = [];
  private selectedIndex = 0;

  constructor() {
    this.store = new ContextStore();
    this.collector = new ContextCollector();
    this.restorer = new ContextRestorer();

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'claude-os dashboard',
      fullUnicode: true,
    });

    this.buildLayout();
    this.bindKeys();
    this.refresh();
  }

  private buildLayout(): void {
    // ── 헤더 ──
    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold} ◆ claude-os  Context Version Control {/bold}{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // ── 상태 패널 (좌상단) ──
    this.statusBox = blessed.box({
      parent: this.screen,
      label: ' Status ',
      top: 3,
      left: 0,
      width: '35%',
      height: 8,
      border: { type: 'line' },
      tags: true,
      style: {
        border: { fg: 'cyan' },
      },
    });

    // ── 브랜치 목록 (좌하단) ──
    this.branchList = blessed.list({
      parent: this.screen,
      label: ' Branches ',
      top: 11,
      left: 0,
      width: '35%',
      height: '100%-14',
      border: { type: 'line' },
      tags: true,
      keys: false,
      style: {
        border: { fg: 'green' },
        selected: { fg: 'black', bg: 'green' },
        item: { fg: 'white' },
      },
      scrollable: true,
      alwaysScroll: true,
    });

    // ── 스냅샷 히스토리 (중앙) ──
    this.logList = blessed.list({
      parent: this.screen,
      label: ' History ',
      top: 3,
      left: '35%',
      width: '40%',
      height: '100%-6',
      border: { type: 'line' },
      tags: true,
      keys: false,
      style: {
        border: { fg: 'yellow' },
        selected: { fg: 'black', bg: 'yellow' },
        item: { fg: 'white' },
      },
      scrollable: true,
      alwaysScroll: true,
    });

    // ── 상세 보기 (우측) ──
    this.detailBox = blessed.box({
      parent: this.screen,
      label: ' Detail ',
      top: 3,
      left: '75%',
      width: '25%',
      height: '100%-6',
      border: { type: 'line' },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        border: { fg: 'magenta' },
      },
    });

    // ── 하단 도움말 바 ──
    this.helpBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' {bold}↑↓{/bold} Navigate  {bold}Enter{/bold} Checkout  {bold}c{/bold} Commit  {bold}b{/bold} New Branch  {bold}t{/bold} Tag  {bold}r{/bold} Restore  {bold}Tab{/bold} Focus  {bold}q{/bold} Quit',
      tags: true,
      style: {
        fg: 'white',
        bg: '#333333',
      },
    });

    // ── 입력 다이얼로그 ──
    this.inputDialog = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: false,
      style: {
        border: { fg: 'cyan' },
        bg: '#222222',
        fg: 'white',
      },
    });
  }

  private bindKeys(): void {
    // 종료
    this.screen.key(['q', 'C-c', 'escape'], () => {
      this.screen.destroy();
      process.exit(0);
    });

    // 히스토리 네비게이션
    this.screen.key(['up', 'k'], () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.logList.select(this.selectedIndex);
        this.showDetail();
        this.screen.render();
      }
    });

    this.screen.key(['down', 'j'], () => {
      if (this.selectedIndex < this.entries.length - 1) {
        this.selectedIndex++;
        this.logList.select(this.selectedIndex);
        this.showDetail();
        this.screen.render();
      }
    });

    // 커밋
    this.screen.key(['c'], () => {
      this.inputDialog.input('{cyan-fg}{bold}Commit Message:{/bold}{/cyan-fg}', '', (err, value) => {
        if (err || !value) { this.screen.render(); return; }
        try {
          const data = this.collector.collect();
          this.store.commit(value, data);
          this.refresh();
        } catch (e: any) {
          this.showMessage(`Error: ${e.message}`);
        }
      });
    });

    // 브랜치 생성
    this.screen.key(['b'], () => {
      this.inputDialog.input('{green-fg}{bold}New Branch Name:{/bold}{/green-fg}', '', (err, value) => {
        if (err || !value) { this.screen.render(); return; }
        try {
          this.store.createBranch(value);
          this.refresh();
        } catch (e: any) {
          this.showMessage(`Error: ${e.message}`);
        }
      });
    });

    // 태그
    this.screen.key(['t'], () => {
      const entry = this.entries[this.selectedIndex];
      if (!entry) return;
      this.inputDialog.input(`{magenta-fg}{bold}Tag for ${entry.shortId}:{/bold}{/magenta-fg}`, '', (err, value) => {
        if (err || !value) { this.screen.render(); return; }
        try {
          this.store.tag(entry.id, value);
          this.refresh();
        } catch (e: any) {
          this.showMessage(`Error: ${e.message}`);
        }
      });
    });

    // 체크아웃 (Enter)
    this.screen.key(['enter'], () => {
      const entry = this.entries[this.selectedIndex];
      if (!entry) return;
      try {
        this.store.checkout(entry.id);
        this.refresh();
        this.showMessage(`Checked out: ${entry.shortId}`);
      } catch (e: any) {
        this.showMessage(`Error: ${e.message}`);
      }
    });

    // 복원 (r)
    this.screen.key(['r'], () => {
      const entry = this.entries[this.selectedIndex];
      if (!entry) return;
      try {
        const snapshot = this.store.getSnapshot(entry.id);
        if (!snapshot) return;
        const restored = this.restorer.restore(snapshot);
        this.showMessage(`Restored ${restored.length} files from ${entry.shortId}`);
      } catch (e: any) {
        this.showMessage(`Error: ${e.message}`);
      }
    });

    // 새로고침
    this.screen.key(['f5', 'C-r'], () => {
      this.refresh();
    });
  }

  private refresh(): void {
    try {
      this.refreshStatus();
      this.refreshLog();
      this.refreshBranches();
      this.showDetail();
    } catch {
      this.statusBox.setContent('{red-fg}저장소가 초기화되지 않았습니다.\nclaude-os init 을 먼저 실행하세요.{/red-fg}');
    }
    this.screen.render();
  }

  private refreshStatus(): void {
    const config = this.store.getConfig();
    const branch = config.currentBranch;
    const head = config.branches[branch]?.head;
    const totalBranches = Object.keys(config.branches).length;

    let content = `{cyan-fg}Branch:{/cyan-fg}  {bold}${branch}{/bold}\n`;
    content += `{cyan-fg}Branches:{/cyan-fg} ${totalBranches}\n`;

    if (head) {
      const snapshot = this.store.getSnapshot(head);
      if (snapshot) {
        content += `{cyan-fg}HEAD:{/cyan-fg}    {yellow-fg}${head.slice(0, 8)}{/yellow-fg}\n`;
        content += `{cyan-fg}Message:{/cyan-fg} ${snapshot.message}\n`;
        const date = new Date(snapshot.timestamp);
        content += `{cyan-fg}Time:{/cyan-fg}    ${date.toLocaleString()}`;
      }
    } else {
      content += `{dim}No snapshots yet{/dim}`;
    }

    this.statusBox.setContent(content);
  }

  private refreshLog(): void {
    this.entries = this.store.log(50);
    const items = this.entries.map((e, i) => {
      const tags = e.tags.length > 0 ? ` {magenta-fg}[${e.tags.join(',')}]{/magenta-fg}` : '';
      return `{yellow-fg}${e.shortId}{/yellow-fg} ${e.message}${tags}`;
    });

    this.logList.setItems(items as any);
    if (this.selectedIndex >= this.entries.length) {
      this.selectedIndex = Math.max(0, this.entries.length - 1);
    }
    this.logList.select(this.selectedIndex);
  }

  private refreshBranches(): void {
    const { branches, current } = this.store.listBranches();
    const items = branches.map(b => {
      const marker = b.name === current ? '{green-fg}● ' : '  ';
      const head = b.head ? `{dim}${b.head.slice(0, 8)}{/dim}` : '{dim}empty{/dim}';
      return `${marker}${b.name}{/green-fg} ${head}`;
    });
    this.branchList.setItems(items as any);
  }

  private showDetail(): void {
    const entry = this.entries[this.selectedIndex];
    if (!entry) {
      this.detailBox.setContent('{dim}No snapshot selected{/dim}');
      return;
    }

    const snapshot = this.store.getSnapshot(entry.id);
    if (!snapshot) {
      this.detailBox.setContent('{red-fg}Snapshot not found{/red-fg}');
      return;
    }

    const meta = snapshot.data.projectMeta;
    const memCount = Object.keys(snapshot.data.memories).length;

    let content = '';
    content += `{bold}ID:{/bold}\n${snapshot.id.slice(0, 16)}\n\n`;
    content += `{bold}Branch:{/bold}\n${snapshot.branch}\n\n`;
    content += `{bold}Message:{/bold}\n${snapshot.message}\n\n`;
    content += `{bold}Author:{/bold}\n${snapshot.author}\n\n`;
    content += `{bold}Time:{/bold}\n${new Date(snapshot.timestamp).toLocaleString()}\n\n`;

    if (snapshot.tags.length > 0) {
      content += `{bold}Tags:{/bold}\n${snapshot.tags.map(t => `{magenta-fg}${t}{/magenta-fg}`).join(', ')}\n\n`;
    }

    content += `{bold}── Context ──{/bold}\n`;
    content += `CLAUDE.md: ${snapshot.data.claudeMd ? '{green-fg}Yes{/green-fg}' : '{dim}No{/dim}'}\n`;
    content += `Memories: ${memCount}\n`;
    content += `Settings: ${snapshot.data.settings ? '{green-fg}Yes{/green-fg}' : '{dim}No{/dim}'}\n`;
    content += `Hooks: ${snapshot.data.hooks.length}\n\n`;

    if (meta.language.length > 0) {
      content += `{bold}── Project ──{/bold}\n`;
      content += `Lang: ${meta.language.join(', ')}\n`;
      if (meta.framework.length > 0) content += `FW: ${meta.framework.join(', ')}\n`;
      if (meta.packageManager) content += `PM: ${meta.packageManager}\n`;
    }

    this.detailBox.setContent(content);
  }

  private showMessage(msg: string): void {
    const msgBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      tags: true,
      style: {
        border: { fg: 'cyan' },
        bg: '#222222',
        fg: 'white',
      },
    });
    msgBox.display(msg, 2, () => {
      msgBox.destroy();
      this.screen.render();
    });
  }

  start(): void {
    this.screen.render();
  }
}
