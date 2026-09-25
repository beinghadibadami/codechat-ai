/**
 * HomeConnect — the compact connect widget on the landing page.
 *
 * One terminal frame, two modes: paste a GitHub URL, or drop local files.
 * Indexing runs in the background; this fires the kickoff request and hands off
 * to the workspace, which shows live progress. Recently indexed repos reattach
 * to cached vectors (no re-embed).
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
  Loader2,
  History,
  Zap,
} from 'lucide-react';
import { apiService, RecentRepo } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';
import { useUnloadWarning } from '@/hooks/useUnloadWarning';
import { clearStoredMessages } from '@/hooks/useChatHistory';
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

export const HomeConnect: React.FC = () => {
  const navigate = useNavigate();
  const { refreshSession, hasData, repoName } = useSession();
  const github = useGithubAuth();

  const [mode, setMode] = useState<Mode>('repo');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRepo[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);

  const valid = mode === 'repo' ? REPO_RE.test(url.trim()) : staged.length > 0;

  // Warn on refresh/close while the kickoff request is in flight.
  useUnloadWarning(busy);

  // Load recently indexed repos (cached vectors — one-click reattach).
  useEffect(() => {
    let cancelled = false;
    apiService
      .getRecentRepos()
      .then(r => {
        if (!cancelled) setRecent(r.repos ?? []);
      })
      .catch(() => {
        /* caching not configured or offline — no recents, no problem */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Confirm replacing the currently indexed codebase, if any. */
  const confirmReplace = (): boolean => {
    if (!hasData) return true;
    return window.confirm(
      `This replaces the codebase you have indexed${repoName ? ` (${repoName})` : ''} ` +
        'and clears its conversation. Continue?'
    );
  };

  /** Shared kickoff: run `action`, then hand off to the workspace. */
  const kickoff = async (action: () => Promise<{ success: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (!res.success) throw new Error(res.message || 'Something went wrong');
      // Fresh codebase → fresh conversation. Drop any prior repo's history.
      clearStoredMessages();
      // Indexing runs in the background; refresh so the session reports
      // `indexing: true`, then hand off to the workspace for live progress.
      await refreshSession();
      navigate('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };

  const indexRepo = (repoUrl: string) => {
    if (busy || !confirmReplace()) return;
    const sendToken = !github.connected && token.trim() ? token.trim() : undefined;
    void kickoff(() => apiService.uploadGitHub(repoUrl.trim(), { token: sendToken }));
  };

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

  const submit = () => {
    if (!valid || busy || !confirmReplace()) return;
    if (mode === 'repo') {
      const sendToken = !github.connected && token.trim() ? token.trim() : undefined;
      void kickoff(() => apiService.uploadGitHub(url.trim(), { token: sendToken }));
    } else {
      void kickoff(() => apiService.uploadFiles(staged, { chunk_size: 800, chunk_overlap: 100 }));
    }
  };

  // ---- Busy: kickoff request in flight ------------------------------------
  if (busy) {
    return (
      <div className="window scanlines">
        <div className="p-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-5 h-5 text-primary animate-spin" aria-hidden />
          <p className="font-mono text-[12px] text-muted">starting indexing…</p>
        </div>
      </div>
    );
  }

  // ---- Idle: connect widget -----------------------------------------------
  return (
    <div className="window scanlines">
      {/* Already-indexed notice — connecting a new source replaces it */}
      {hasData && (
        <div className="flex items-center gap-2 px-4 h-9 border-b border-border
                        bg-primary/[0.05] font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
          <span className="text-muted truncate">
            indexed: <span className="text-foreground">{repoName ?? 'a codebase'}</span>
          </span>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="ml-auto shrink-0 text-primary hover:underline focus-ring rounded-sm"
          >
            resume →
          </button>
        </div>
      )}

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

            {/* Recently indexed — reattach to cached vectors (no re-embed) */}
            {recent.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint mb-2.5">
                  <History className="w-3 h-3" aria-hidden />
                  recent · instant reattach
                </p>
                <div className="space-y-1">
                  {recent.map(r => (
                    <button
                      key={r.repo_url}
                      type="button"
                      onClick={() => indexRepo(r.repo_url)}
                      className="group w-full flex items-center gap-2 px-2.5 h-9 border border-border
                                 bg-background/40 hover:border-primary/40 hover:bg-primary/[0.04]
                                 interactive focus-ring text-left"
                    >
                      <Github className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
                      <span className="font-mono text-[12px] text-muted group-hover:text-foreground truncate">
                        {r.repo_name || r.repo_url.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                      </span>
                      <span className="ml-auto shrink-0 flex items-center gap-1 font-mono text-[10px] text-primary/70">
                        <Zap className="w-3 h-3" aria-hidden />
                        {r.file_count} files
                      </span>
                    </button>
                  ))}
                </div>
              </div>
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
