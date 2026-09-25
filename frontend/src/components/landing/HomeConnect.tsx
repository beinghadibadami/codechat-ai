/**
 * HomeConnect — the compact connect widget on the landing page.
 *
 * One terminal frame, two modes: paste a GitHub URL, or drop local files.
 * Kicks off indexing in place (the upload endpoint blocks until done), shows a
 * live phase log while it runs, and routes into the workspace on success.
 *
 * Deliberately compact — a single prompt line, not two big panels.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Github,
  Upload,
  Lock,
  X,
  FileCode,
} from 'lucide-react';
import { apiService } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';
import { clearStoredMessages } from '@/hooks/useChatHistory';
import { IndexingState, IndexPhase } from '@/components/states/IndexingState';
import { cn } from '@/lib/utils';

/** Loose check for a github repo URL — the backend validates properly. */
const REPO_RE = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i;

/** Mirrors backend SUPPORTED_EXTENSIONS closely enough to pre-filter. */
const SUPPORTED = [
  '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp',
  '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.ex', '.exs',
  '.vue', '.svelte', '.sql', '.sh', '.yaml', '.yml', '.json', '.toml', '.md',
];
const MAX_FILES = 40;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.venv|venv|target|coverage)(\/|$)/;

type Mode = 'repo' | 'upload';

/** Timed phase progression for the blocking upload request. */
const PHASE_SEQ: IndexPhase[] = ['fetch', 'read', 'chunk', 'embed'];

export const HomeConnect: React.FC = () => {
  const navigate = useNavigate();
  const { setHasData, refreshSession } = useSession();
  const github = useGithubAuth();

  const [mode, setMode] = useState<Mode>('repo');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<IndexPhase>('fetch');

  const fileInput = useRef<HTMLInputElement>(null);
  const phaseTimer = useRef<number>();

  const valid = mode === 'repo' ? REPO_RE.test(url.trim()) : staged.length > 0;

  // Drive the phase log on a timer while the request is in flight. It advances
  // through the sequence and holds on the last step until the promise settles.
  useEffect(() => {
    if (!busy) {
      window.clearInterval(phaseTimer.current);
      return;
    }
    let i = 0;
    setPhase(PHASE_SEQ[0]);
    phaseTimer.current = window.setInterval(() => {
      i = Math.min(i + 1, PHASE_SEQ.length - 1);
      setPhase(PHASE_SEQ[i]);
    }, 1500);
    return () => window.clearInterval(phaseTimer.current);
  }, [busy]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: File[] = [...staged];
    const seen = new Set(staged.map(f => f.name + f.size));
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (SKIP_DIR_RE.test(rel)) continue;
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
      if (!SUPPORTED.includes(ext)) continue;
      if (file.size > MAX_FILE_BYTES) continue;
      const key = file.name + file.size;
      if (seen.has(key)) continue;
      if (next.length >= MAX_FILES) break;
      next.push(file);
      seen.add(key);
    }
    setStaged(next);
    setError(null);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'repo') {
        const sendToken = !github.connected && token.trim() ? token.trim() : undefined;
        const res = await apiService.uploadGitHub(url.trim(), { token: sendToken });
        if (!res.success) throw new Error(res.message || 'Could not index the repository');
      } else {
        const res = await apiService.uploadFiles(staged, { chunk_size: 800, chunk_overlap: 100 });
        if (!res.success) throw new Error(res.message || 'Upload failed');
      }
      // Fresh codebase → fresh conversation. Drop any prior repo's history.
      clearStoredMessages();
      setHasData(true);
      await refreshSession();
      navigate('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };

  // ---- Busy: live indexing log --------------------------------------------
  if (busy) {
    return (
      <div className="animate-fade-in">
        <IndexingState phase={phase} sourceType={mode === 'repo' ? 'github' : 'upload'} />
        <p className="mt-4 text-center font-mono text-[11px] text-faint">
          this runs once · hang tight
        </p>
      </div>
    );
  }

  // ---- Idle: connect widget -----------------------------------------------
  return (
    <div className="window scanlines">
      {/* Tab bar */}
      <div className="window-bar gap-0 px-0">
        <span className="window-dots ml-3" />
        <div className="ml-auto flex h-full">
          {(['repo', 'upload'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={cn(
                'px-4 h-full font-mono text-[11px] border-l border-border interactive',
                mode === m
                  ? 'text-primary bg-panel'
                  : 'text-faint hover:text-muted bg-raised/40'
              )}
            >
              {m === 'repo' ? 'repo' : 'upload'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {mode === 'repo' ? (
          <>
            {/* Prompt line */}
            <div
              className={cn(
                'flex items-center gap-2 h-12 px-3 border bg-background/60 font-mono text-sm',
                url && !valid ? 'border-destructive/50' : 'border-border focus-within:border-primary/50'
              )}
            >
              <span className="text-primary shrink-0">$</span>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="github.com/owner/repo"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="GitHub repository URL"
                className="flex-1 bg-transparent outline-none text-foreground
                           placeholder:text-faint min-w-0"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!valid}
                aria-label="Index repository"
                className="shrink-0 h-8 w-8 grid place-items-center bg-primary text-primary-foreground
                           disabled:opacity-30 disabled:cursor-not-allowed
                           hover:bg-primary-dark interactive focus-ring"
              >
                <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            </div>

            {/* Private repo access */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {github.connected ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-primary">
                  <Github className="w-3 h-3" aria-hidden />
                  {github.user ? `@${github.user}` : 'connected'} · private repos ok
                </span>
              ) : github.configured ? (
                <>
                  <button
                    type="button"
                    onClick={github.connect}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted
                               hover:text-primary interactive focus-ring rounded-sm"
                  >
                    <Github className="w-3 h-3" aria-hidden />
                    connect github for private repos
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="font-mono text-[11px] text-faint hover:text-muted interactive focus-ring rounded-sm"
                  >
                    or use a token
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-faint
                             hover:text-muted interactive focus-ring rounded-sm"
                >
                  <Lock className="w-3 h-3" aria-hidden />
                  private repo? use an access token
                </button>
              )}
            </div>

            {showToken && !github.connected && (
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_… (sent once, never stored)"
                spellCheck={false}
                aria-label="GitHub access token"
                className="mt-3 w-full h-10 px-3 border border-border bg-background/60
                           font-mono text-[12.5px] text-foreground placeholder:text-faint
                           outline-none focus:border-primary/50 interactive"
              />
            )}
          </>
        ) : (
          <>
            {/* Dropzone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                'flex items-center gap-3 h-12 px-3 border border-dashed cursor-pointer interactive focus-ring',
                dragging ? 'border-primary bg-primary/[0.06]' : 'border-border bg-background/60 hover:border-border-elevated'
              )}
            >
              <Upload className="w-4 h-4 text-primary shrink-0" aria-hidden />
              <span className="font-mono text-[12.5px] text-muted truncate">
                {staged.length
                  ? `${staged.length} file${staged.length === 1 ? '' : 's'} staged`
                  : 'drop files or click to browse'}
              </span>
              {staged.length > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setStaged([]); }}
                  aria-label="Clear staged files"
                  className="ml-auto shrink-0 text-faint hover:text-foreground interactive"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              multiple
              accept={SUPPORTED.join(',')}
              onChange={e => addFiles(e.target.files)}
              className="hidden"
            />

            {staged.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <FileCode className="w-3 h-3 text-faint shrink-0" aria-hidden />
                <span className="font-mono text-[11px] text-faint truncate">
                  {staged.slice(0, 3).map(f => f.name).join(', ')}
                  {staged.length > 3 && ` +${staged.length - 3} more`}
                </span>
                <button
                  type="button"
                  onClick={submit}
                  className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-8 px-3
                             bg-primary text-primary-foreground font-mono text-[11px]
                             hover:bg-primary-dark interactive focus-ring"
                >
                  index <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            )}

            <p className="mt-3 font-mono text-[11px] text-faint">
              up to {MAX_FILES} files · nothing leaves your session
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 font-mono text-[11px] text-destructive flex items-start gap-1.5">
            <span className="shrink-0">✗</span>
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
};
