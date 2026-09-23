/**
 * CodePreview — read-only source viewer with line numbers and cited-line
 * highlighting.
 *
 * Used as the right pane in the chat workspace, the main pane on /files, and
 * inside a sheet on mobile. Content is cached per path so jumping between
 * citations in the same file doesn't refetch.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Copy, Check, Loader2, FileCode, Lock, ExternalLink } from 'lucide-react';
import { apiService } from '@/services/api';
import { codeTheme } from '@/lib/codeTheme';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';

/** Map extension → Prism language id. */
const langFor = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust',
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', vb: 'vbnet',
    html: 'markup', xml: 'markup', css: 'css',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', rst: 'rest', sql: 'sql', csv: 'csv', ipynb: 'json',
  };
  return map[ext] ?? 'text';
};

/** Module-scoped cache: path → file text. */
const cache = new Map<string, string>();

export interface PreviewTarget {
  path: string;
  lineStart?: number;
  lineEnd?: number;
}

interface Props {
  target: PreviewTarget | null;
  /** Link out to the file on GitHub when we know the repo */
  repoUrl?: string | null;
  className?: string;
  /** Rendered in the header (e.g. a close button in the mobile sheet) */
  headerAction?: React.ReactNode;
}

export const CodePreview: React.FC<Props> = ({ target, repoUrl, className, headerAction }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const path = target?.path ?? null;

  // Fetch (or reuse) file content
  useEffect(() => {
    if (!path) {
      setContent('');
      setError(null);
      return;
    }

    const cached = cache.get(path);
    if (cached !== undefined) {
      setContent(cached);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await apiService.getFileContent(path);
        if (cancelled) return;
        cache.set(path, res.content);
        setContent(res.content);
        setTruncated(res.truncated);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not read the file');
          setContent('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // Scroll the cited line into view once content is painted
  useEffect(() => {
    if (!content || !target?.lineStart) return;
    const id = window.setTimeout(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${target.lineStart}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [content, target?.lineStart, target?.path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  // ---- Nothing selected -------------------------------------------------
  if (!target) {
    return (
      <div className={cn('flex flex-col h-full min-h-0', className)}>
        <div className="panel-header shrink-0">
          <span className="tag-mono">source</span>
          {headerAction}
        </div>
        <div className="flex-1 grid place-items-center">
          <EmptyState
            icon={FileCode}
            title="No file open"
            description="Click a citation in an answer, or pick a file from the tree, to read it here."
          />
        </div>
      </div>
    );
  }

  const fileName = target.path.split('/').pop() ?? target.path;
  const start = target.lineStart ?? 0;
  const end = target.lineEnd ?? start;

  const lineProps = (lineNumber: number) => {
    const cited = start > 0 && lineNumber >= start && lineNumber <= end;
    return {
      'data-line': lineNumber,
      className: cited ? 'line-cited' : undefined,
      style: { display: 'block', paddingLeft: '0.4rem', paddingRight: '0.4rem' },
    } as React.HTMLAttributes<HTMLElement>;
  };

  const githubHref =
    repoUrl && !repoUrl.endsWith('/')
      ? `${repoUrl}/blob/HEAD/${target.path}${start ? `#L${start}` : ''}`
      : null;

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Header */}
      <div className="panel-header shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCode className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
          <span className="font-mono text-xs truncate" title={target.path}>
            {fileName}
          </span>
          {start > 0 && (
            <span className="font-mono text-2xs text-primary shrink-0">
              :{start}
              {end !== start ? `-${end}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <span
            className="hidden sm:flex items-center gap-1 tag-mono mr-1"
            title="This view is read-only"
          >
            <Lock className="w-2.5 h-2.5" aria-hidden />
            read-only
          </span>

          {githubHref && (
            <a
              href={githubHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-6 h-6 grid place-items-center rounded-sm text-faint
                         hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                         focus-visible:outline-none"
              aria-label="Open on GitHub"
              title="Open on GitHub"
            >
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          )}

          <button
            type="button"
            onClick={copy}
            disabled={!content}
            className="w-6 h-6 grid place-items-center rounded-sm text-faint
                       hover:text-foreground disabled:opacity-40
                       focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={copied ? 'Copied' : 'Copy file contents'}
            title={copied ? 'Copied' : 'Copy file contents'}
          >
            {copied ? (
              <Check className="w-3 h-3 text-cyan" aria-hidden />
            ) : (
              <Copy className="w-3 h-3" aria-hidden />
            )}
          </button>

          {headerAction}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        {loading && (
          <div className="grid place-items-center py-12 text-faint" role="status">
            <span className="flex items-center gap-1.5 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Loading {fileName}
            </span>
          </div>
        )}

        {error && !loading && <ErrorState message={error} />}

        {!loading && !error && content && (
          <SyntaxHighlighter
            language={langFor(fileName)}
            style={codeTheme}
            showLineNumbers
            wrapLines
            lineProps={lineProps}
            lineNumberStyle={{
              minWidth: '2.6rem',
              paddingRight: '0.75rem',
              textAlign: 'right',
              color: 'hsl(var(--text-faint))',
              userSelect: 'none',
            }}
            customStyle={{
              margin: 0,
              background: 'transparent',
              padding: '0.5rem 0',
              fontSize: '12.5px',
            }}
            codeTagProps={{ style: { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } }}
          >
            {content}
          </SyntaxHighlighter>
        )}

        {truncated && !loading && (
          <p className="px-3 py-2 text-2xs text-faint border-t border-border">
            File truncated for display.
          </p>
        )}
      </div>
    </div>
  );
};
