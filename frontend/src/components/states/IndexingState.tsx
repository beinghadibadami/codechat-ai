/**
 * IndexingState — progress while a repo is cloned/uploaded and embedded.
 *
 * The backend doesn't stream per-file progress, so rather than fake a
 * percentage we show the real phase sequence and an indeterminate bar. Phases
 * are derived from what we can actually observe (files_processed > 0 means
 * embedding has started).
 */
import React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IndexPhase = 'fetch' | 'read' | 'chunk' | 'embed' | 'done';

const PHASES: Array<{ key: IndexPhase; label: string; githubLabel?: string }> = [
  { key: 'fetch', label: 'Receiving files', githubLabel: 'Cloning repository' },
  { key: 'read', label: 'Reading source files' },
  { key: 'chunk', label: 'Splitting into chunks' },
  { key: 'embed', label: 'Building the index' },
];

interface Props {
  /** Current phase; everything before it renders as complete */
  phase: IndexPhase;
  sourceType?: 'github' | 'upload' | null;
  filesProcessed?: number;
  /** Shown under the phase list when known */
  detail?: string | null;
  onCancel?: () => void;
  className?: string;
}

export const IndexingState: React.FC<Props> = ({
  phase,
  sourceType,
  filesProcessed,
  detail,
  onCancel,
  className,
}) => {
  const currentIndex = PHASES.findIndex(p => p.key === phase);
  const activeIndex = phase === 'done' ? PHASES.length : Math.max(currentIndex, 0);

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      {/* Indeterminate bar — honest about not knowing the exact percentage */}
      <div
        className="relative h-1 rounded-full bg-raised overflow-hidden indexing-sweep"
        role="progressbar"
        aria-label="Indexing progress"
        aria-valuetext={PHASES[activeIndex]?.label ?? 'Finishing'}
      />

      <ul className="mt-5 space-y-2.5" aria-live="polite">
        {PHASES.map((p, i) => {
          const complete = i < activeIndex;
          const active = i === activeIndex;
          const label = sourceType === 'github' && p.githubLabel ? p.githubLabel : p.label;

          return (
            <li key={p.key} className="flex items-center gap-2.5">
              {complete ? (
                <Check className="w-3.5 h-3.5 text-cyan shrink-0" aria-hidden />
              ) : active ? (
                <Loader2 className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" aria-hidden />
              ) : (
                <Circle className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
              )}
              <span
                className={cn(
                  'text-[13px]',
                  complete && 'text-muted',
                  active && 'text-foreground font-medium',
                  !complete && !active && 'text-faint'
                )}
              >
                {label}
              </span>
              {active && typeof filesProcessed === 'number' && filesProcessed > 0 && (
                <span className="font-mono text-2xs text-faint ml-auto">
                  {filesProcessed} files
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {detail && (
        <p className="mt-4 font-mono text-2xs text-faint truncate" title={detail}>
          {detail}
        </p>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 text-xs text-muted hover:text-foreground underline
                     underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring
                     focus-visible:outline-none rounded-sm"
        >
          Cancel and start over
        </button>
      )}
    </div>
  );
};
