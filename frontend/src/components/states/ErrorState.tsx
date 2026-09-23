/**
 * ErrorState — classifies a raw error message into something actionable.
 *
 * The backend already returns human-readable `detail` strings for the common
 * failures (auth, not found, unsupported repo). This maps those to a title +
 * next step so the user isn't left guessing which of the five possible causes
 * they hit.
 */
import React from 'react';
import { AlertTriangle, RefreshCw, Github, Lock, SearchX, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ErrorKind =
  | 'auth'
  | 'permission'
  | 'not-found'
  | 'invalid-url'
  | 'unsupported'
  | 'network'
  | 'indexing'
  | 'unknown';

/** Best-effort classification from a message string. */
export const classifyError = (message?: string | null): ErrorKind => {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'unknown';
  if (m.includes('authentication') || m.includes('personal access token') || m.includes('unauthor')) {
    return 'auth';
  }
  if (m.includes('permission') || m.includes('forbidden') || m.includes('403')) return 'permission';
  if (m.includes('not found') || m.includes('404')) return 'not-found';
  if (m.includes('parse') || m.includes('valid github') || m.includes('expected https')) {
    return 'invalid-url';
  }
  if (m.includes('no valid code files') || m.includes('unsupported')) return 'unsupported';
  if (m.includes('network') || m.includes('fetch') || m.includes('timed out') || m.includes('timeout')) {
    return 'network';
  }
  if (m.includes('index') || m.includes('upsert') || m.includes('pinecone')) return 'indexing';
  return 'unknown';
};

const COPY: Record<ErrorKind, { title: string; help: string; Icon: React.ElementType }> = {
  auth: {
    title: 'Authentication needed',
    help: 'This repository is private. Connect GitHub, or paste a personal access token with `repo` scope.',
    Icon: Lock,
  },
  permission: {
    title: 'No access to this repository',
    help: 'Your GitHub account can reach the URL but lacks read permission. Ask for access, or pick another repository.',
    Icon: Lock,
  },
  'not-found': {
    title: 'Repository not found',
    help: 'Double-check the owner and name. If it is private, connect GitHub first so we can see it.',
    Icon: SearchX,
  },
  'invalid-url': {
    title: 'That URL does not look right',
    help: 'Use the main repository URL, for example https://github.com/owner/repo — not a file or issue link.',
    Icon: Github,
  },
  unsupported: {
    title: 'Nothing indexable found',
    help: 'We could not find source files we understand. Check that the repository contains code, not only assets or docs.',
    Icon: FileWarning,
  },
  network: {
    title: 'Connection problem',
    help: 'The request did not complete. Check your connection and try again.',
    Icon: AlertTriangle,
  },
  indexing: {
    title: 'Indexing failed',
    help: 'The files were read but could not be indexed. Retrying usually clears this.',
    Icon: AlertTriangle,
  },
  unknown: {
    title: 'Something went wrong',
    help: 'The operation did not complete. Try again, and if it keeps failing the details below may help.',
    Icon: AlertTriangle,
  },
};

interface Props {
  message?: string | null;
  kind?: ErrorKind;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra action, e.g. "Connect GitHub" */
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export const ErrorState: React.FC<Props> = ({
  message,
  kind,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
  compact = false,
}) => {
  const resolved = kind ?? classifyError(message);
  const { title, help, Icon } = COPY[resolved];

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-2.5 p-3 rounded-md border',
          'border-destructive/30 bg-destructive/[0.06]',
          className
        )}
      >
        <Icon className="w-4 h-4 text-destructive shrink-0 mt-px" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">{help}</p>
          {message && (
            <p className="font-mono text-2xs text-faint mt-1.5 break-words">{message}</p>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs shrink-0">
            {retryLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center text-center px-6 py-12', className)}
    >
      <div
        className="w-10 h-10 rounded-md border border-destructive/30 bg-destructive/[0.08]
                   grid place-items-center mb-4"
        aria-hidden
      >
        <Icon className="w-4.5 h-4.5 text-destructive" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13px] text-muted max-w-md leading-relaxed">{help}</p>

      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button size="sm" onClick={onRetry} className="gap-1.5 h-8 text-xs">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}

      {message && (
        <details className="mt-5 text-left max-w-md w-full">
          <summary className="cursor-pointer text-2xs text-faint font-mono">
            technical detail
          </summary>
          <pre className="mt-2 text-2xs font-mono bg-raised border border-border rounded-sm
                          p-2.5 overflow-auto max-h-32 whitespace-pre-wrap break-words">
            {message}
          </pre>
        </details>
      )}
    </div>
  );
};
