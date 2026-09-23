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
      'flex flex-col items-center justify-center text-center px-6 py-14',
      grid && 'grid-backdrop',
      className
    )}
  >
    {Icon && (
      <div
        className="w-10 h-10 rounded-md border border-border bg-raised
                   grid place-items-center mb-4"
        aria-hidden
      >
        <Icon className="w-4.5 h-4.5 text-muted" />
      </div>
    )}

    <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>

    {description && (
      <p className="mt-1.5 text-[13px] text-muted max-w-sm leading-relaxed">
        {description}
      </p>
    )}

    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}

    {hints && hints.length > 0 && (
      <ul className="mt-5 flex flex-wrap items-center justify-center gap-1.5 max-w-lg">
        {hints.map(h => (
          <li
            key={h}
            className="font-mono text-2xs px-1.5 py-0.5 rounded-sm
                       border border-border bg-raised/60 text-faint"
          >
            {h}
          </li>
        ))}
      </ul>
    )}
  </div>
);
