/**
 * LocalSource — upload source files or a whole folder from disk.
 *
 * Deliberately equal in weight to the GitHub path. Preserves the original
 * upload behaviour (validation, chunk config, apiService.uploadFiles) while
 * adding folder selection and a clearer file list.
 */
import React, { useState, useRef, DragEvent, ChangeEvent, useCallback } from 'react';
import {
  Upload,
  FolderOpen,
  FileCode,
  X,
  Sliders,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiService, ConfigRequest } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { ErrorState } from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';

/** Mirrors backend SUPPORTED_EXTENSIONS so we never reject what it accepts. */
const SUPPORTED = [
  '.py', '.js', '.ts', '.jsx', '.tsx',
  '.java', '.c', '.cpp', '.go', '.rs',
  '.php', '.rb', '.swift', '.kt', '.cs', '.vb',
  '.html', '.css', '.json', '.xml', '.yml', '.yaml',
  '.ipynb', '.md', '.txt', '.rst',
  '.sql', '.csv',
];

/** Shown as chips — the long tail lives behind "and more". */
const HEADLINE_EXTS = ['.ts', '.tsx', '.js', '.py', '.go', '.rs', '.java', '.rb', '.php', '.cs', '.sql', '.md'];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 40;

const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.venv|venv|target|coverage)(\/|$)/;

interface Staged {
  id: string;
  file: File;
  /** Relative path when the user picked a folder */
  path: string;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${units[i]}`;
};

interface Props {
  onIndexed?: () => void;
}

export const LocalSource: React.FC<Props> = ({ onIndexed }) => {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigRequest>({ chunk_size: 800, chunk_overlap: 100 });
  const [configOpen, setConfigOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { setHasData, refreshSession } = useSession();

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      const accepted: Staged[] = [];
      const rejected: string[] = [];

      for (const file of incoming) {
        // `webkitRelativePath` is populated for folder selections
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

        if (SKIP_DIR_RE.test(relPath)) continue; // silently skip build/dep dirs

        const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
        if (!SUPPORTED.includes(ext)) {
          rejected.push(`${file.name} (unsupported type)`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name} (over 10 MB)`);
          continue;
        }
        accepted.push({
          id: `${relPath}-${file.size}-${file.lastModified}`,
          file,
          path: relPath,
        });
      }

      setStaged(prev => {
        // De-dupe by id, respect the cap
        const seen = new Set(prev.map(s => s.id));
        const merged = [...prev];
        for (const s of accepted) {
          if (seen.has(s.id)) continue;
          if (merged.length >= MAX_FILES) break;
          merged.push(s);
          seen.add(s.id);
        }
        if (accepted.length && merged.length >= MAX_FILES) {
          toast({
            title: 'File limit reached',
            description: `Only the first ${MAX_FILES} files were kept.`,
          });
        }
        return merged;
      });

      if (rejected.length) {
        toast({
          title: `Skipped ${rejected.length} file${rejected.length === 1 ? '' : 's'}`,
          description: rejected.slice(0, 3).join(', ') + (rejected.length > 3 ? '…' : ''),
        });
      }
    },
    [toast]
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = ''; // allow re-picking the same selection
  };

  const upload = async () => {
    if (!staged.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiService.uploadFiles(staged.map(s => s.file), config);
      if (!res.success) throw new Error(res.message || 'Upload failed');

      setHasData(true);
      await refreshSession();
      toast({ title: 'Codebase indexed', description: res.message });
      setStaged([]);
      onIndexed?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const totalSize = staged.reduce((sum, s) => sum + s.file.size, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Drop target */}
      <div
        className={cn(
          'dropzone flex-1 min-h-[9rem] flex flex-col items-center justify-center gap-3 p-6 cursor-pointer',
          dragOver && 'drag-over'
        )}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Drop source files here, or press Enter to browse"
      >
        <Upload
          className={cn('w-6 h-6 transition-colors', dragOver ? 'text-primary' : 'text-faint')}
          aria-hidden
        />
        <div className="text-center">
          <p className="text-[13px] font-medium">
            Drop a folder or select source files from your computer.
          </p>
          <p className="text-xs text-muted mt-1">
            Up to {MAX_FILES} files, 10 MB each
          </p>
        </div>
        <div className="flex gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={e => {
              e.stopPropagation();
              fileInput.current?.click();
            }}
          >
            <FileCode className="w-3.5 h-3.5" aria-hidden />
            Select files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={e => {
              e.stopPropagation();
              folderInput.current?.click();
            }}
          >
            <FolderOpen className="w-3.5 h-3.5" aria-hidden />
            Select folder
          </Button>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={SUPPORTED.join(',')}
        onChange={onPick}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        onChange={onPick}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        // Non-standard but supported in Chromium/WebKit; harmless elsewhere
        {...{ webkitdirectory: '', directory: '' }}
      />

      {/* Supported types */}
      <ul className="flex flex-wrap gap-1 mt-3" aria-label="Supported file types">
        {HEADLINE_EXTS.map(ext => (
          <li
            key={ext}
            className="font-mono text-2xs px-1.5 py-0.5 rounded-sm border border-border
                       bg-raised/60 text-faint"
          >
            {ext}
          </li>
        ))}
        <li className="text-2xs px-1 py-0.5 text-faint">and more</li>
      </ul>

      {/* Staged files */}
      {staged.length > 0 && (
        <div className="mt-4 border border-border rounded-md overflow-hidden">
          <div className="panel-header">
            <span className="tag-mono">
              selected · {staged.length} file{staged.length === 1 ? '' : 's'}
            </span>
            <span className="font-mono text-2xs text-faint">{formatSize(totalSize)}</span>
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-border/60">
            {staged.map(s => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                <FileCode className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
                <span className="font-mono text-xs truncate flex-1" title={s.path}>
                  {s.path}
                </span>
                <span className="font-mono text-2xs text-faint shrink-0">
                  {formatSize(s.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setStaged(prev => prev.filter(x => x.id !== s.id))}
                  className="text-faint hover:text-foreground rounded-sm shrink-0
                             focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Remove ${s.path}`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <ErrorState compact message={error} onRetry={upload} className="mt-3" />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Sliders className="w-3.5 h-3.5" aria-hidden />
              Chunking
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-[15px]">Chunking</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted leading-relaxed">
              Smaller chunks retrieve more precisely; larger chunks keep more
              surrounding context. The defaults suit most codebases.
            </p>
            <div className="space-y-3 mt-1">
              <div className="space-y-1.5">
                <Label htmlFor="chunk-size" className="text-xs">Chunk size (characters)</Label>
                <Input
                  id="chunk-size"
                  type="number"
                  min={200}
                  max={2000}
                  step={100}
                  value={config.chunk_size}
                  onChange={e =>
                    setConfig(p => ({ ...p, chunk_size: parseInt(e.target.value) || 800 }))
                  }
                  className="font-mono text-xs h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chunk-overlap" className="text-xs">Overlap (characters)</Label>
                <Input
                  id="chunk-overlap"
                  type="number"
                  min={0}
                  max={500}
                  step={50}
                  value={config.chunk_overlap}
                  onChange={e =>
                    setConfig(p => ({ ...p, chunk_overlap: parseInt(e.target.value) || 100 }))
                  }
                  className="font-mono text-xs h-8"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          onClick={upload}
          disabled={!staged.length || busy}
          className="flex-1 h-8 text-xs gap-1.5"
        >
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Indexing
            </>
          ) : (
            `Index ${staged.length || ''} file${staged.length === 1 ? '' : 's'}`.trim()
          )}
        </Button>
      </div>
    </div>
  );
};
