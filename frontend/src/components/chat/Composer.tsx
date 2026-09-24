/**
 * Composer — the chat input.
 *
 * States handled: idle, submitting/streaming (with stop), error with retry.
 * Suggested prompts appear only on an empty conversation so they act as entry
 * points rather than permanent chrome.
 */
import React, { useEffect, useRef } from 'react';
import { Send, Square, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Shown on an empty thread — broad openers for an unfamiliar codebase. */
export const SUGGESTED_PROMPTS = [
  'Give me a tour of this codebase',
  'Draw the request flow as a diagram',
  'Explain this service like I joined today',
  'What are the riskiest parts of this code?',
  'Where does configuration get loaded?',
];

/**
 * Always-available quick actions, kept short so the row doesn't dominate the
 * composer. These stay visible mid-conversation — previously suggestions
 * vanished after the first message, which left the input bare.
 */
export const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Diagram it',
    prompt: 'Draw a diagram of how this works, scoped to what we just discussed.',
  },
  {
    label: 'Summarize',
    prompt: 'Give me a concise summary of this codebase and what it does.',
  },
  {
    label: 'Find bugs',
    prompt: 'Look for likely bugs, missing error handling, or edge cases in the code we discussed.',
  },
  {
    label: 'Tech stack',
    prompt: 'What frameworks, libraries and services does this project use?',
  },
  {
    label: 'Latest PR',
    prompt: 'What does the latest pull request change, and what could it affect?',
  },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  /** Renders the suggestion row (empty conversations only) */
  showSuggestions?: boolean;
  onPickSuggestion?: (prompt: string) => void;
  /** Last error, with a retry affordance */
  error?: string | null;
  onRetry?: () => void;
  placeholder?: string;
}

const MAX_CHARS = 2000; // matches the backend validator

export const Composer: React.FC<Props> = ({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming = false,
  disabled = false,
  showSuggestions = false,
  onPickSuggestion,
  error,
  onRetry,
  placeholder = 'Ask about this codebase…',
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a cap, then scroll internally
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled && !streaming;
  const overLimit = value.length > MAX_CHARS;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. Ctrl/Cmd+Enter also sends,
    // matching the habit from the previous version.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !overLimit) onSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-panel/70 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-3">
        {/* Openers — only on an empty thread, where a blank input is daunting */}
        {showSuggestions && (
          <div className="mb-2.5">
            <span className="tag-mono">try</span>
            <ul className="flex gap-1.5 mt-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {SUGGESTED_PROMPTS.map(p => (
                <li key={p} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onPickSuggestion?.(p)}
                    disabled={disabled}
                    className="px-2.5 py-1.5 rounded-full border border-border bg-raised/60
                               text-xs text-muted whitespace-nowrap
                               hover:text-foreground hover:border-primary/40 interactive
                               disabled:opacity-50 disabled:cursor-not-allowed
                               focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick actions — persist for the whole conversation */}
        {!showSuggestions && onPickSuggestion && (
          <ul className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-0.5">
            {QUICK_ACTIONS.map(a => (
              <li key={a.label} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onPickSuggestion(a.prompt)}
                  disabled={disabled || streaming}
                  title={a.prompt}
                  className="px-2 py-1 rounded-full border border-border bg-raised/40
                             text-2xs text-faint whitespace-nowrap
                             hover:text-foreground hover:border-border-elevated interactive
                             disabled:opacity-40 disabled:cursor-not-allowed
                             focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Error + retry */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 mb-2.5 px-2.5 py-2 rounded-sm
                       border border-destructive/30 bg-destructive/[0.06]"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-px" aria-hidden />
            <p className="text-xs text-muted flex-1 leading-relaxed">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 text-xs text-foreground hover:text-primary
                           rounded-sm shrink-0 focus-visible:ring-2 focus-visible:ring-ring
                           focus-visible:outline-none"
              >
                <RotateCcw className="w-3 h-3" aria-hidden />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Input */}
        <div
          className={cn(
            'relative rounded-md border bg-raised/50 transition-colors',
            overLimit ? 'border-destructive/60' : 'border-border focus-within:border-border-elevated'
          )}
        >
          <Textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            aria-label="Message"
            aria-describedby="composer-hint"
            className="min-h-[2.5rem] max-h-40 resize-none border-0 bg-transparent
                       text-[14px] leading-relaxed pr-11 py-2.5
                       focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          {/* Send / stop */}
          <div className="absolute right-1.5 bottom-1.5">
            {streaming && onStop ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onStop}
                className="h-7 w-7 p-0"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="w-3 h-3" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onSubmit}
                disabled={!canSend || overLimit}
                className="h-7 w-7 p-0"
                aria-label="Send message"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        {/* Hint row */}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <p id="composer-hint" className="text-2xs text-faint">
            <kbd className="kbd">Enter</kbd> to send ·{' '}
            <kbd className="kbd">Shift</kbd>
            <span className="mx-0.5">+</span>
            <kbd className="kbd">Enter</kbd> for a new line
          </p>
          {value.length > MAX_CHARS * 0.75 && (
            <span
              className={cn(
                'font-mono text-2xs',
                overLimit ? 'text-destructive' : 'text-faint'
              )}
            >
              {value.length}/{MAX_CHARS}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
