/**
 * IndexingState — live progress while a repo is cloned/uploaded and embedded.
 *
 * Indexing now runs asynchronously on the backend and reports a phase plus
 * file/chunk counts, which the session poll surfaces. We show the real numbers
 * as a terminal log — no invented percentages.
 */
import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IndexProgress } from '@/services/api';

/** Backend phase → ordered step it maps to. */
const STEPS: Array<{ keys: IndexProgress['phase'][]; label: string; githubLabel?: string }> = [
  { keys: ['clone'], label: 'receiving files', githubLabel: 'cloning repository' },
  { keys: ['load'], label: 'reading & chunking source' },
  { keys: ['embed'], label: 'building the index' },
];

interface Props {
  progress?: IndexProgress | null;
  sourceType?: 'github' | 'upload' | null;
  onCancel?: () => void;
  className?: string;
}

export const IndexingState: React.FC<Props> = ({ progress, sourceType, onCancel, className }) => {
  const phase = progress?.phase ?? 'clone';

  // Which step is active. 'done' completes everything; anything else finds its
  // step, defaulting to the first while we wait for the first update.
  const activeStep =
    phase === 'done'
      ? STEPS.length
      : Math.max(0, STEPS.findIndex(s => s.keys.includes(phase)));

  const filesDone = progress?.files_done ?? 0;
  const filesTotal = progress?.files_total ?? 0;
  const chunksDone = progress?.chunks_done ?? 0;
  const chunksTotal = progress?.chunks_total ?? 0;

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      <div className="window scanlines">
        <div className="window-bar">
          <span className="window-dots" />
          <span className="ml-1 font-mono text-2xs text-faint">gitchat · indexing</span>
          <span className="ml-auto flex items-center gap-1.5 tag-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            live
          </span>
        </div>

        <div className="p-4 font-mono text-[12.5px] leading-relaxed space-y-1.5" aria-live="polite">
          {STEPS.map((s, i) => {
            const complete = i < activeStep;
            const active = i === activeStep;
            const label = sourceType === 'github' && s.githubLabel ? s.githubLabel : s.label;

            // Per-step live count
            let count = '';
            if (active && s.keys.includes('load') && filesDone > 0) {
              count = filesTotal ? `${filesDone}/${filesTotal} files` : `${filesDone} files`;
            } else if (active && s.keys.includes('embed') && chunksTotal > 0) {
              count = `${chunksDone}/${chunksTotal} chunks`;
            }

            return (
              <div
                key={s.label}
                className={cn(
                  'flex items-center gap-2',
                  complete && 'text-muted',
                  active && 'text-foreground',
                  !complete && !active && 'text-faint/50'
                )}
              >
                {complete ? (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
                ) : active ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" aria-hidden />
                ) : (
                  <span className="w-3.5 text-center text-faint/50 shrink-0" aria-hidden>·</span>
                )}
                <span className="text-primary/50 shrink-0">$</span>
                <span className={cn('truncate', active && 'term-cursor')}>{label}</span>
                {count && <span className="text-2xs text-faint ml-auto shrink-0">{count}</span>}
              </div>
            );
          })}
        </div>

        <div
          className="relative h-1 bg-raised overflow-hidden indexing-sweep"
          role="progressbar"
          aria-label="Indexing progress"
          aria-valuetext={STEPS[activeStep]?.label ?? 'finishing'}
        />
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 font-mono text-[11px] text-muted hover:text-foreground
                     focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
        >
          $ cancel
        </button>
      )}
    </div>
  );
};
