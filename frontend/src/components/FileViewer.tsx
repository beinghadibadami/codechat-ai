/**
 * FileViewer — modal wrapper around CodePreview.
 *
 * The chat workspace shows source in a side pane instead, but a modal is still
 * the right shape for surfaces without room for a third column (the shared
 * read-only session view). The `Citation` type lives here because it predates
 * the split and is imported widely.
 */
import React from 'react';
import { X } from 'lucide-react';
import { CodePreview } from '@/components/workspace/CodePreview';

export interface Citation {
  file: string;
  lineStart?: number;
  lineEnd?: number;
}

interface Props {
  citation: Citation | null;
  onClose: () => void;
  repoUrl?: string | null;
}

export const FileViewer: React.FC<Props> = ({ citation, onClose, repoUrl }) => {
  // Close on Escape
  React.useEffect(() => {
    if (!citation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [citation, onClose]);

  if (!citation) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/75 backdrop-blur-sm
                 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Source of ${citation.file}`}
    >
      <div
        className="w-full max-w-4xl h-[80vh] bg-panel border border-border rounded-md
                   shadow-overlay overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <CodePreview
          target={{
            path: citation.file,
            lineStart: citation.lineStart,
            lineEnd: citation.lineEnd,
          }}
          repoUrl={repoUrl}
          headerAction={
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 grid place-items-center rounded-sm text-faint
                         hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                         focus-visible:outline-none"
              aria-label="Close"
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
          }
        />
      </div>
    </div>
  );
};
