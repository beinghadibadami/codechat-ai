/**
 * exportChat
 *
 * Serializes a chat conversation to Markdown and triggers a browser download.
 * Preserves message roles, timestamps, and any code blocks or metadata.
 */
import type { Message } from '@/hooks/useChatHistory';

/**
 * Convert messages to a Markdown document.
 */
export const messagesToMarkdown = (messages: Message[]): string => {
  const now = new Date().toISOString();
  const lines: string[] = [
    '# CodeChat AI - Conversation Export',
    '',
    `**Exported:** ${now}`,
    `**Total messages:** ${messages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const role = msg.type === 'user' ? '👤 You' : '🤖 CodeChat AI';
    const ts = msg.timestamp instanceof Date
      ? msg.timestamp.toLocaleString()
      : new Date(msg.timestamp).toLocaleString();

    lines.push(`## ${role}`);
    lines.push(`*${ts}*`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');

    if (msg.metadata && msg.metadata.chunks_found > 0) {
      lines.push('<details><summary>Retrieval metadata</summary>');
      lines.push('');
      lines.push(`- Chunks retrieved: ${msg.metadata.chunks_found}`);
      lines.push(`- Files involved: ${msg.metadata.files_involved}`);
      lines.push(`- Reranked: ${msg.metadata.retrieval_reranked ? 'yes' : 'no'}`);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * Download a string as a file in the browser.
 */
const downloadTextFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Export chat as a Markdown file.
 */
export const exportChatAsMarkdown = (messages: Message[]) => {
  if (messages.length === 0) return;
  const md = messagesToMarkdown(messages);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadTextFile(md, `codechat-conversation-${stamp}.md`, 'text/markdown');
};

/**
 * Export chat as JSON (useful for reimporting later).
 */
export const exportChatAsJSON = (messages: Message[]) => {
  if (messages.length === 0) return;
  const json = JSON.stringify(messages, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadTextFile(json, `codechat-conversation-${stamp}.json`, 'application/json');
};
