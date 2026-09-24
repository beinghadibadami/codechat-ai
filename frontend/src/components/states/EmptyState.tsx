/**
 * EmptyState — one component for every "nothing here yet" surface.
 *
 * Every empty state in the product explains what to do next and gives a way
 * to do it, rather than just stating that something is missing.
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ElementType;
  title: string;
  /** One or two plain sentences on what to do next */
  description?: React.ReactNode;
  /** Primary and secondary actions */
  action?: React.ReactNode;
  /** Monospace hints, e.g. supported extensions or example prompts */
  hints?: string[];
  className?: string;
  /** Editor grid backdrop — used for larger, full-pane empties */
  grid?: boolean;
}

export const EmptyState: React.FC<Props> = ({
  icon: Icon,
  title,
  description,
  action,
  hints,
  className,
  grid = false,
}) => (
  <div
    className={cn(
      'relative flex flex-col items-center justify-center text-center px-6 py-14',
      className
    )}
  >
    {/* Faint grid behind the icon gives the empty area some structure without
        competing with the copy. */}
    {grid && (
      <div
        className="absolute inset-0 grid-backdrop fade-mask-edges opacity-50 -z-10"
        aria-hidden
      />
    )}

    {Icon && (
      <div className="relative mb-5" aria-hidden>
        {/* Soft amber pool behind the glyph */}
        <div
          className="absolute -inset-5 rounded-full blur-2xl"
          style={{ background: 'hsl(var(--amber) / 0.10)' }}
        />
        <div
          className="relative w-11 h-11 rounded-lg border border-border bg-panel
                     grid place-items-center"
        >
          <Icon className="w-[18px] h-[18px] text-primary" />
        </div>
      </div>
    )}

    <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>

    {description && (
      <p className="mt-2 text-[13px] text-muted max-w-sm leading-relaxed">
        {description}
      </p>
    )}

    {action && (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
    )}

    {hints && hints.length > 0 && (
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-1.5 max-w-lg">
        {hints.map(h => (
          <li
            key={h}
            className="font-mono text-2xs px-2 py-1 rounded-full
                       border border-border bg-raised/50 text-faint"
          >
            {h}
          </li>
        ))}
      </ul>
    )}
  </div>
);
