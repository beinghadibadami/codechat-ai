/**
 * GithubSource — connect a repository by URL.
 *
 * Auth has three tiers, in the order the UI offers them:
 *   1. OAuth ("Connect GitHub") — preferred, token never touches the browser
 *   2. Personal access token — fallback when OAuth isn't configured
 *   3. Neither — public repositories still work
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Github,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';
import { ErrorState } from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';

/** Accepts owner/repo URLs, tolerating /tree/<branch> and trailing slashes. */
const REPO_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/tree\/[\w./-]+)?\/?$/;
const BAD_PATH_RE = /\/(blob|issues|pull|wiki|releases|actions|commits)\b/;

type Validity = 'empty' | 'valid' | 'invalid';

interface Props {
  onIndexed?: () => void;
}

export const GithubSource: React.FC<Props> = ({ onIndexed }) => {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenFieldOpen, setTokenFieldOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const { setHasData, refreshSession } = useSession();
  const github = useGithubAuth();

  // Surface OAuth callback results once
  useEffect(() => {
    if (!github.flash) return;
    toast({
      title: github.flash.type === 'success' ? 'GitHub' : 'GitHub',
      description: github.flash.message,
      variant: github.flash.type === 'success' ? undefined : 'destructive',
    });
    github.dismissFlash();
  }, [github, toast]);

  const validity: Validity = useMemo(() => {
    const v = url.trim();
    if (!v) return 'empty';
    if (BAD_PATH_RE.test(v)) return 'invalid';
    return REPO_RE.test(v) ? 'valid' : 'invalid';
  }, [url]);

  const validationHint =
    validity === 'invalid'
      ? BAD_PATH_RE.test(url)
        ? 'Use the main repository URL, not a file, issue or pull request link.'
        : 'Expected https://github.com/owner/repo'
      : null;

  const connect = async () => {
    if (validity !== 'valid' || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Only send a PAT if OAuth isn't already covering us
      const sendToken = !github.connected && token.trim() ? token.trim() : undefined;
      const res = await apiService.uploadGitHub(url.trim(), { token: sendToken });
      if (!res.success) throw new Error(res.message || 'Could not index the repository');

      setHasData(true);
      await refreshSession();
      setToken('');
      toast({ title: 'Repository indexed', description: res.message });
      onIndexed?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not index the repository';
      setError(msg);
      // Auth failures are the one case where we proactively reveal the PAT field
      if (/auth|token|private|not found/i.test(msg) && !github.connected) {
        setTokenFieldOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Auth status */}
      {github.configured ? (
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-3 h-9 rounded-md border mb-3',
            github.connected
              ? 'border-cyan/30 bg-cyan/[0.06]'
              : 'border-border bg-raised/50'
          )}
        >
          {github.connected ? (
            <>
              <span className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan shrink-0" aria-hidden />
                <span className="text-xs truncate">
                  Connected as{' '}
                  <span className="font-mono text-foreground">@{github.user ?? 'unknown'}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={github.disconnect}
                className="flex items-center gap-1 text-2xs text-muted hover:text-foreground
                           rounded-sm shrink-0 focus-visible:ring-2 focus-visible:ring-ring
                           focus-visible:outline-none"
              >
                <LogOut className="w-3 h-3" aria-hidden />
                Disconnect
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted min-w-0">
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="truncate">Connect for private repositories</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={github.connect}
                disabled={github.loading}
                className="h-6 px-2 text-2xs gap-1 shrink-0"
              >
                <Github className="w-3 h-3" aria-hidden />
                Connect
              </Button>
            </>
          )}
        </div>
      ) : null}

      {/* Repository URL */}
      <div className="space-y-1.5">
        <label htmlFor="repo-url" className="tag-mono block">
          repository url
        </label>
        <div className="relative">
          <Input
            id="repo-url"
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && validity === 'valid') connect();
            }}
            disabled={busy}
            aria-invalid={validity === 'invalid'}
            aria-describedby={validationHint ? 'repo-url-hint' : undefined}
            className={cn(
              'font-mono text-xs h-9 pr-8',
              validity === 'valid' && 'border-cyan/50',
              validity === 'invalid' && 'border-destructive/50'
            )}
          />
          {validity === 'valid' && (
            <CheckCircle2
              className="w-3.5 h-3.5 text-cyan absolute right-2.5 top-1/2 -translate-y-1/2"
              aria-hidden
            />
          )}
        </div>
        {validationHint && (
          <p id="repo-url-hint" className="text-xs text-destructive">
            {validationHint}
          </p>
        )}
      </div>

      {/* PAT fallback */}
      {!github.connected && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setTokenFieldOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground
                       rounded-sm focus-visible:ring-2 focus-visible:ring-ring
                       focus-visible:outline-none"
            aria-expanded={tokenFieldOpen}
          >
            <Lock className="w-3 h-3" aria-hidden />
            {tokenFieldOpen ? 'Hide access token' : 'Use an access token instead'}
          </button>

          {tokenFieldOpen && (
            <div className="mt-2 space-y-1.5 animate-fade-in">
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="ghp_…"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="GitHub personal access token"
                  className="font-mono text-xs h-8 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint
                             hover:text-foreground rounded-sm focus-visible:ring-2
                             focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-2xs text-faint leading-relaxed">
                Needs <code className="text-muted">repo</code> scope. Used once for the
                clone, never stored.{' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=CodeChat%20AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-cyan hover:underline"
                >
                  Create one
                  <ExternalLink className="w-2.5 h-2.5" aria-hidden />
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {error && <ErrorState compact message={error} onRetry={connect} className="mt-3" />}

      <div className="flex-1" />

      <Button
        size="sm"
        onClick={connect}
        disabled={validity !== 'valid' || busy}
        className="w-full h-8 text-xs gap-1.5 mt-4"
      >
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Indexing repository
          </>
        ) : (
          <>
            <Github className="w-3.5 h-3.5" aria-hidden />
            Index repository
          </>
        )}
      </Button>

      <p className="text-2xs text-faint mt-2 leading-relaxed">
        Shallow clone of the default branch. Build output and dependencies are skipped.
      </p>
    </div>
  );
};
