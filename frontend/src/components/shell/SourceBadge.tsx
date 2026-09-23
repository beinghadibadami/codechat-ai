/**
 * SourceBadge — shows which codebase is active and whether it's indexed.
 *
 * Used in the sidebar (stacked) and the top bar (inline). Status is conveyed
 * with an icon + text, never colour alone.
 */
import React from 'react';
import { Github, HardDrive, CheckCircle2, Loader2, CircleDashed } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { cn } from '@/lib/utils';

interface Props {
  /** `inline` is the compact top-bar form */
  variant?: 'stacked' | 'inline';
  className?: string;
}

export const SourceBadge: React.FC<Props> = ({ variant = 'stacked', className }) => {
  const { sessionInfo, hasData } = useSession();

  const sourceType = sessionInfo?.source_type ?? null;
  const name = sessionInfo?.repo_name ?? null;
  const indexing = sessionInfo?.indexing ?? false;
  const fileCount = sessionInfo?.files_processed ?? 0;

  // Nothing connected yet
  if (!sourceType && !hasData) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-faint',
          variant === 'stacked' ? 'flex-col items-start gap-1' : '',
          className
        )}
      >
        <span className="flex items-center gap-1.5">
          <CircleDashed className="w-3.5 h-3.5" aria-hidden />
          <span className="text-xs">No codebase</span>
        </span>
        {variant === 'stacked' && (
          <span className="tag-mono">connect a source</span>
        )}
      </div>
    );
  }

  const SourceIcon = sourceType === 'github' ? Github : HardDrive;

  const status = indexing
    ? { label: 'Indexing', Icon: Loader2, spin: true, tone: 'text-primary' }
    : hasData
      ? { label: `${fileCount} file${fileCount === 1 ? '' : 's'} indexed`, Icon: CheckCircle2, spin: false, tone: 'text-cyan' }
      : { label: 'Not indexed', Icon: CircleDashed, spin: false, tone: 'text-faint' };

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 min-w-0', className)}>
        <SourceIcon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
        <span className="font-mono text-xs text-foreground truncate max-w-[16rem]">
          {name ?? 'Untitled'}
        </span>
        <span className={cn('flex items-center gap-1 shrink-0', status.tone)}>
          <status.Icon
            className={cn('w-3 h-3', status.spin && 'animate-spin')}
            aria-hidden
          />
          <span className="text-2xs">{status.label}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <span className="tag-mono">active source</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <SourceIcon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
        <span className="font-mono text-xs text-foreground truncate" title={name ?? undefined}>
          {name ?? 'Untitled'}
        </span>
      </div>
      <div className={cn('flex items-center gap-1.5', status.tone)}>
        <status.Icon
          className={cn('w-3 h-3 shrink-0', status.spin && 'animate-spin')}
          aria-hidden
        />
        <span className="text-2xs">{status.label}</span>
      </div>
    </div>
  );
};
