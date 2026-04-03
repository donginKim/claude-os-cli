import { ConversationHistory, ConversationMessage } from './history.js';

/** 내보내기 형식 */
export type ExportFormat = 'markdown' | 'html' | 'json';

/** 내보내기 옵션 */
export interface ExportOptions {
  format: ExportFormat;
  includeTools?: boolean;
  includeTimestamps?: boolean;
  since?: number; // days
}

/** 세션 내보내기 */
export class SessionExporter {
  private history: ConversationHistory;

  constructor() {
    this.history = new ConversationHistory();
  }

  /** 단일 세션 내보내기 */
  exportSession(sessionId: string, opts: ExportOptions, cwd?: string): string {
    const messages = this.history.getMessages(sessionId, cwd);
    if (messages.length === 0) return '';
    return this.render(messages, sessionId, opts);
  }

  /** 전체 세션 내보내기 */
  exportAll(opts: ExportOptions, cwd?: string): string {
    const sessions = this.history.listSessions(cwd);
    const filtered = opts.since
      ? sessions.filter(s => {
          const age = (Date.now() - new Date(s.timestamp).getTime()) / (24 * 60 * 60 * 1000);
          return age <= opts.since!;
        })
      : sessions;

    if (filtered.length === 0) return '';

    const parts = filtered.map(s => {
      const messages = this.history.getMessages(s.id, cwd);
      return this.render(messages, s.id, opts);
    });

    if (opts.format === 'html') {
      return this.wrapHtml(parts.join('\n<hr/>\n'), '전체 대화 히스토리');
    }
    return parts.join('\n\n---\n\n');
  }

  private render(messages: ConversationMessage[], sessionId: string, opts: ExportOptions): string {
    switch (opts.format) {
      case 'markdown': return this.toMarkdown(messages, sessionId, opts);
      case 'html': return this.toHtml(messages, sessionId, opts);
      case 'json': return JSON.stringify(messages, null, 2);
    }
  }

  private toMarkdown(messages: ConversationMessage[], sessionId: string, opts: ExportOptions): string {
    const lines: string[] = [];
    lines.push(`## Session: ${sessionId.slice(0, 8)}`);
    lines.push('');

    for (const msg of messages) {
      const role = msg.role === 'user' ? '**User**' : '**Assistant**';

      if (opts.includeTimestamps && msg.timestamp) {
        lines.push(`_${new Date(msg.timestamp).toLocaleString()}_`);
      }

      if (msg.text) {
        lines.push(`${role}:`);
        lines.push('');
        lines.push(msg.text);
        lines.push('');
      }

      if (opts.includeTools && msg.toolCalls?.length) {
        lines.push(`> Tools: ${msg.toolCalls.join(', ')}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private toHtml(messages: ConversationMessage[], sessionId: string, opts: ExportOptions): string {
    const msgBlocks = messages.map(msg => {
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
      const parts: string[] = [];

      if (opts.includeTimestamps && msg.timestamp) {
        parts.push(`<span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span>`);
      }

      parts.push(`<div class="message ${roleClass}">`);
      parts.push(`<strong>${roleLabel}</strong>`);
      if (msg.text) {
        parts.push(`<div class="content">${this.escapeHtml(msg.text).replace(/\n/g, '<br/>')}</div>`);
      }
      if (opts.includeTools && msg.toolCalls?.length) {
        parts.push(`<div class="tools">Tools: ${msg.toolCalls.join(', ')}</div>`);
      }
      parts.push('</div>');
      return parts.join('\n');
    });

    const body = `<h2>Session: ${sessionId.slice(0, 8)}</h2>\n${msgBlocks.join('\n')}`;
    return this.wrapHtml(body, `Session ${sessionId.slice(0, 8)}`);
  }

  private wrapHtml(body: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
  .message { margin: 16px 0; padding: 12px 16px; border-radius: 8px; }
  .user { background: #16213e; border-left: 3px solid #0f3460; }
  .assistant { background: #1a1a2e; border-left: 3px solid #53c28b; }
  .content { margin-top: 8px; white-space: pre-wrap; line-height: 1.6; }
  .tools { margin-top: 8px; color: #888; font-size: 0.85em; }
  .timestamp { color: #666; font-size: 0.8em; }
  strong { color: #e94560; }
  .assistant strong { color: #53c28b; }
  hr { border: none; border-top: 1px solid #333; margin: 32px 0; }
  h2 { color: #e94560; border-bottom: 1px solid #333; padding-bottom: 8px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
