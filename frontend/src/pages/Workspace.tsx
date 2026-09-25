/**
 * Workspace — the post-connect landing inside the app shell.
 *
 * Connecting a codebase now happens on the marketing page (HomeConnect), so
 * this route only ever shows two states:
 *   1. Indexing in flight → live phase log
 *   2. Codebase ready      → summary + jump-off points
 * If someone lands here with no session, send them home to connect.
 */
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  HardDrive,
  MessageSquare,
  Compass,
  Network,
  GitPullRequest,
  ArrowRight,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { IndexingState } from '@/components/states/IndexingState';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';

const JUMP_OFFS: Array<{
  to: string;
  icon: React.ElementType;
  title: string;
  body: string;
  needsRepo?: boolean;
}> = [
  {
    to: '/chat',
    icon: MessageSquare,
    title: 'Ask a question',
    body: 'Start a conversation about how this codebase works.',
  },
  {
    to: '/chat?q=' + encodeURIComponent('Give me a tour of this codebase — what are the main pieces and how do they fit together?'),
    icon: Compass,
    title: 'Get oriented',
    body: 'A guided tour of the main modules and how they connect.',
  },
  {
    to: '/chat?q=' + encodeURIComponent('Draw the request flow from entry point to data layer as a diagram.'),
    icon: Network,
    title: 'Diagram a flow',
    body: 'Ask for a flow and get a rendered diagram inline.',
  },
  {
    to: '/pulls',
    icon: GitPullRequest,
    title: 'Review a change',
    body: 'Pull up a diff and ask what it affects.',
    needsRepo: true,
  },
];

const Workspace: React.FC = () => {
  const navigate = useNavigate();
  const { hasData, isIndexing, sessionInfo, sourceType, repoName, resetSession, isLoading } =
    useSession();

  const filesProcessed = sessionInfo?.files_processed ?? 0;

  // No session and nothing indexing → connecting happens on the home page.
  useEffect(() => {
    if (!isLoading && !hasData && !isIndexing) {
      navigate('/', { replace: true });
    }
  }, [isLoading, hasData, isIndexing, navigate]);

  const phase = useMemo(() => {
    if (!isIndexing) return 'done' as const;
    return filesProcessed > 0 ? ('embed' as const) : ('fetch' as const);
  }, [isIndexing, filesProcessed]);

  // ---- Indexing ---------------------------------------------------------
  if (isIndexing) {
    return (
      <AppShell>
        <div className="h-full grid place-items-center px-6 py-16">
          <div className="w-full max-w-md">
            <p className="eyebrow mb-3">indexing</p>
            <h1 className="font-display text-xl font-bold tracking-tight mb-1.5">
              {repoName ?? 'Your codebase'}
            </h1>
            <p className="text-[13px] text-muted mb-6">
              This runs once. You can leave — progress is kept on the server.
            </p>
            <IndexingState
              phase={phase}
              sourceType={sourceType}
              filesProcessed={filesProcessed}
              onCancel={async () => {
                await resetSession();
              }}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  // ---- Ready ------------------------------------------------------------
  if (hasData) {
    const SourceIcon = sourceType === 'github' ? Github : HardDrive;
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10">
          <p className="eyebrow mb-3">workspace</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2 min-w-0">
                <SourceIcon className="w-5 h-5 text-primary shrink-0" aria-hidden />
                <span className="font-mono truncate">{repoName ?? 'Untitled'}</span>
              </h1>
              <p className="text-[13px] text-muted mt-1.5">
                {filesProcessed} file{filesProcessed === 1 ? '' : 's'} indexed and ready to query.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!window.confirm('Disconnect this codebase and start over?')) return;
                await resetSession();
              }}
              className="h-8 text-xs gap-1.5 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              Change source
            </Button>
          </div>

          <h2 className="text-sm font-medium mt-9 mb-3">Where to next</h2>
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {JUMP_OFFS.filter(j => !j.needsRepo || sourceType === 'github').map(j => {
              const Icon = j.icon;
              return (
                <li key={j.to}>
                  <button
                    type="button"
                    onClick={() => navigate(j.to)}
                    className="group w-full text-left p-3.5 border border-border
                               bg-panel hover:border-primary/40 hover:bg-raised/40
                               interactive focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
                      <span className="text-[13px] font-medium">{j.title}</span>
                      <ArrowRight
                        className="w-3.5 h-3.5 text-faint ml-auto shrink-0
                                   opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-hidden
                      />
                    </span>
                    <span className="block text-xs text-muted mt-1.5 leading-relaxed">
                      {j.body}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </AppShell>
    );
  }

  // ---- Redirecting home -------------------------------------------------
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <Loader2 className="w-5 h-5 text-primary animate-spin" aria-hidden />
    </div>
  );
};

export default Workspace;
