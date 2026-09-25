/**
 * IndexingState — progress while a repo is cloned/uploaded and embedded.
 *
 * The backend doesn't stream per-file progress, so rather than fake a
 * percentage we show the real phase sequence as a terminal log and an
 * indeterminate sweep bar. Phases are derived from what we can observe
 * (files_processed > 0 means embedding has started), or advanced on a timer
 * by the caller while a blocking upload request is in flight.
 */
import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IndexPhase = 'fetch' | 'read' | 'chunk' | 'embed' | 'done';

const PHASES: Array<{ key: IndexPhase; label: string; githubLabel?: string }> = [
  { key: 'fetch', label: 'receiving files', githubLabel: 'cloning repository' },
  { key: 'read', label: 'reading source files' },
  { key: 'chunk', label: 'splitting into chunks' },
  { key: 'embed', label: 'building the index' },
];

interface Props {
  phase: IndexPhase;
  sourceType?: 'github' | 'upload' | null;
  filesProcessed?: number;
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
      {/* Terminal-framed log */}
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
          {PHASES.map((p, i) => {
            const complete = i < activeIndex;
            const active = i === activeIndex;
            const label = sourceType === 'github' && p.githubLabel ? p.githubLabel : p.label;

            return (
              <div
                key={p.key}
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
                {active && typeof filesProcessed === 'number' && filesProcessed > 0 && (
                  <span className="text-2xs text-faint ml-auto shrink-0">
                    {filesProcessed} files
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Indeterminate sweep — honest about not knowing the exact percentage */}
        <div
          className="relative h-1 bg-raised overflow-hidden indexing-sweep"
          role="progressbar"
          aria-label="Indexing progress"
          aria-valuetext={PHASES[activeIndex]?.label ?? 'finishing'}
        />
      </div>

      {detail && (
        <p className="mt-3 font-mono text-2xs text-faint truncate" title={detail}>
          {detail}
        </p>
      )}

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
