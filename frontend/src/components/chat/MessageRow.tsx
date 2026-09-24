/**
 * MessageRow — one turn in the conversation.
 *
 * Editor-style grouping: a monospace role gutter, hairline separator between
 * turns, no floating bubbles. User turns get a subtle raised background so the
 * two roles are distinguishable without shouting.
 */
import React, { useState } from 'react';
import { Copy, Check, FileCode, GitPullRequest } from 'lucide-react';
import { MessageFormatter } from '@/components/MessageFormatter';
import type { Citation } from '@/components/FileViewer';
import type { Message } from '@/hooks/useChatHistory';
import { cn } from '@/lib/utils';

interface Props {
  message: Message;
  onCitationClick: (c: Citation) => void;
  /** Show a blinking caret while this message is still streaming */
  streaming?: boolean;
  /** Open a source file from the sources strip */
  onOpenSource?: (c: Citation) => void;
}

const formatTime = (d: Date | string) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const MessageRow: React.FC<Props> = ({
  message,
  onCitationClick,
  streaming = false,
  onOpenSource,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.type === 'user';

  const sources = message.metadata?.sources ?? [];
  const pr = message.metadata?.pull_request;

  // De-duplicate the sources strip by file so it stays readable
  const uniqueSources = Array.from(
    new Map(sources.filter(s => s.file_name).map(s => [s.file_path ?? s.file_name, s])).values()
  ).slice(0, 8);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <article
      className={cn('message-row group/msg px-4 sm:px-5', isUser && 'bg-raised/30')}
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      <div className="max-w-3xl mx-auto flex gap-3 sm:gap-4">
        {/* Role gutter */}
        <div
          className={cn('message-gutter hidden sm:block', isUser ? 'text-faint' : 'text-primary/70')}
          aria-hidden
        >
          {isUser ? 'you' : 'codechat'}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          {/* Mobile role label */}
          <span
            className={cn(
              'sm:hidden tag-mono block mb-1.5',
              isUser ? 'text-faint' : 'text-primary/70'
            )}
          >
            {isUser ? 'you' : 'codechat'}
          </span>

          {/* PR context notice */}
          {pr && (
            <div
              className="flex items-center gap-1.5 mb-2.5 px-2 py-1 rounded-sm
                         border border-cyan/25 bg-cyan/[0.06] w-fit"
            >
              <GitPullRequest className="w-3 h-3 text-cyan shrink-0" aria-hidden />
              <span className="text-2xs text-muted">
                Diff attached ·{' '}
                <span className="font-mono text-foreground">#{pr.number}</span> ·{' '}
                {pr.changed_files} file{pr.changed_files === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {isUser ? (
            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : (
            <div className={streaming ? 'streaming-caret' : undefined}>
              <MessageFormatter
                content={message.content}
                sources={sources}
                onCitationClick={onCitationClick}
                streaming={streaming}
              />
            </div>
          )}

          {/* Sources strip */}
          {!isUser && uniqueSources.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-border/60">
              <span className="tag-mono">
                sources · {message.metadata?.chunks_found ?? uniqueSources.length} chunk
                {(message.metadata?.chunks_found ?? 0) === 1 ? '' : 's'}
              </span>
              <ul className="flex flex-wrap gap-1.5 mt-1.5">
                {uniqueSources.map(s => (
                  <li key={s.file_path ?? s.file_name}>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSource?.({
                          file: s.file_path ?? s.file_name ?? '',
                          lineStart: s.line_start ?? undefined,
                          lineEnd: s.line_end ?? undefined,
                        })
                      }
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm
                                 border border-border bg-raised/60 text-faint
                                 hover:text-foreground hover:border-border-elevated interactive
                                 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      title={`Open ${s.file_path ?? s.file_name}`}
                    >
                      <FileCode className="w-2.5 h-2.5 shrink-0" aria-hidden />
                      <span className="font-mono text-2xs">{s.file_name}</span>
                      {s.line_start ? (
                        <span className="font-mono text-2xs opacity-70">:{s.line_start}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer: timestamp + copy */}
          <div className="flex items-center gap-2 mt-2.5">
            <time className="font-mono text-2xs text-faint">{formatTime(message.timestamp)}</time>
            {!isUser && (
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1 text-2xs text-faint hover:text-foreground
                           rounded-sm opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100
                           interactive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? (
                  <>
                    <Check className="w-2.5 h-2.5 text-cyan" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-2.5 h-2.5" aria-hidden /> Copy
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
