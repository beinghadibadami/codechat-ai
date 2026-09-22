/**
 * FileViewer
 *
 * Modal that shows a file with syntax highlighting and highlights the
 * lines from a citation. Fetches file content on open, keeps a tiny
 * in-memory cache to avoid re-fetches when the user clicks multiple
 * citations for the same file.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services/api';

export interface Citation {
  file: string;
  lineStart?: number;
  lineEnd?: number;
}

interface Props {
  citation: Citation | null;
  onClose: () => void;
}

// Guess Prism language from file extension
const langFromExt = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    java: 'java', c: 'c', cpp: 'cpp', go: 'go', rs: 'rust', rb: 'ruby',
    php: 'php', swift: 'swift', kt: 'kotlin', cs: 'csharp',
    html: 'html', css: 'css', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql',
  };
  return map[ext] || 'text';
};

// tiny module-scoped cache: file_path → content
const cache = new Map<string, string>();

export const FileViewer: React.FC<Props> = ({ citation, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!citation) return;

    const load = async () => {
      setError(null);
      const cached = cache.get(citation.file);
      if (cached) {
        setContent(cached);
        return;
      }
      setLoading(true);
      try {
        const res = await apiService.getFileContent(citation.file);
        cache.set(citation.file, res.content);
        setContent(res.content);
      } catch (e: any) {
        setError(e?.message || 'Failed to load file');
        setContent('');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [citation]);

  // Scroll to the cited line after content renders
  useEffect(() => {
    if (!citation || !content || !citation.lineStart) return;
    // Give the highlighter one frame to paint
    const t = setTimeout(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(
        `[data-line="${citation.lineStart}"]`
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(t);
  }, [content, citation]);

  if (!citation) return null;

  const language = langFromExt(citation.file);
  const start = citation.lineStart ?? 0;
  const end = citation.lineEnd ?? start;

  // Style function that highlights lines within [start, end]
  const lineProps = (lineNumber: number) => {
    const isHighlighted = start > 0 && lineNumber >= start && lineNumber <= end;
    return {
      'data-line': lineNumber,
      style: {
        display: 'block',
        backgroundColor: isHighlighted ? 'rgba(250, 204, 21, 0.15)' : undefined,
        borderLeft: isHighlighted ? '2px solid rgb(250, 204, 21)' : '2px solid transparent',
        paddingLeft: '0.5rem',
      },
    } as React.HTMLAttributes<HTMLElement>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${citation.file}`}
    >
      <div
        className="w-full max-w-5xl max-h-[85vh] bg-background-elevated border border-border rounded-lg shadow-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-sm truncate">{citation.file}</span>
            {citation.lineStart && (
              <span className="text-xs text-muted-foreground shrink-0">
                :{citation.lineStart}
                {citation.lineEnd && citation.lineEnd !== citation.lineStart
                  ? `-${citation.lineEnd}`
                  : ''}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close file viewer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading file...
            </div>
          )}
          {error && (
            <div className="p-6 text-destructive text-sm">Error: {error}</div>
          )}
          {!loading && !error && content && (
            <SyntaxHighlighter
              language={language}
              style={oneDark}
              showLineNumbers
              wrapLines
              lineProps={lineProps}
              customStyle={{ margin: 0, background: 'transparent', fontSize: '0.85rem' }}
              codeTagProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
            >
              {content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>
  );
};
