/**
 * Workspace — the entry route.
 *
 * Three states:
 *   1. Nothing connected → source launcher (GitHub | Local, equal weight)
 *   2. Indexing in flight → phase list
 *   3. Codebase ready    → summary + jump-off points
 */
import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { GithubSource } from '@/components/source/GithubSource';
import { LocalSource } from '@/components/source/LocalSource';
import { IndexingState } from '@/components/states/IndexingState';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { cn } from '@/lib/utils';

/**
 * Entry points from a ready workspace. Most of these seed the chat with a
 * question rather than navigating somewhere new — reading files and viewing
 * diagrams both happen inside a conversation now.
 */
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

  // Phase is inferred from observable state rather than invented
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
            <p className="tag-mono mb-1.5">indexing</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {repoName ?? 'Your codebase'}
            </h1>
            <p className="text-[13px] text-muted mt-1.5 mb-7">
              This runs once. You can leave this page — progress is kept on the server.
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
          <p className="tag-mono mb-2">workspace</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 min-w-0">
                <SourceIcon className="w-5 h-5 text-muted shrink-0" aria-hidden />
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
                    className="group w-full text-left p-3.5 rounded-md border border-border
                               bg-panel hover:border-border-elevated hover:bg-raised/40
                               interactive focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted shrink-0" aria-hidden />
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

  // ---- Nothing connected ------------------------------------------------
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <header className="max-w-2xl">
          <p className="tag-mono mb-2">codechat</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1]">
            Talk to your code.
            <br />
            <span className="text-muted">Build with context.</span>
          </h1>
          <p className="mt-4 text-[14.5px] text-muted leading-relaxed max-w-xl">
            Point CodeChat at a codebase and ask it anything — how a flow works, what a
            pull request changes, where a value gets validated. Every answer can be traced
            back to the file and line it came from.
          </p>
        </header>

        {/* Source launcher — two equal paths */}
        <section className="mt-9" aria-labelledby="source-heading">
          <h2 id="source-heading" className="text-sm font-medium mb-3">
            Connect a codebase
          </h2>

          <div className="grid lg:grid-cols-2 gap-3">
            {/* GitHub */}
            <div className="panel flex flex-col p-4">
              <div className="flex items-center gap-2 mb-1">
                <Github className="w-4 h-4 text-muted" aria-hidden />
                <h3 className="text-[13px] font-medium">GitHub repository</h3>
                <span className="tag-mono ml-auto">remote</span>
              </div>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Index a public repo, or connect your account for private ones.
              </p>
              <div className="flex-1">
                <GithubSource onIndexed={() => navigate('/chat')} />
              </div>
            </div>

            {/* Local */}
            <div className="panel flex flex-col p-4">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-4 h-4 text-muted" aria-hidden />
                <h3 className="text-[13px] font-medium">Local files</h3>
                <span className="tag-mono ml-auto">disk</span>
              </div>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Upload a folder or pick individual source files. Nothing leaves your session.
              </p>
              <div className="flex-1 flex flex-col">
                <LocalSource onIndexed={() => navigate('/chat')} />
              </div>
            </div>
          </div>
        </section>

        {/* What you can do — real capabilities, not marketing */}
        <section className="mt-12" aria-labelledby="capabilities-heading">
          <h2 id="capabilities-heading" className="text-sm font-medium mb-3">
            What you can ask
          </h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              'Trace the checkout flow',
              'What changed in this pull request?',
              'Where do we validate the plan?',
              'Explain this service like I joined today',
              'What could break if I rename this field?',
              'Which files depend on the auth guard?',
            ].map(q => (
              <li
                key={q}
                className={cn(
                  'px-3 py-2 rounded-md border border-border bg-panel/60',
                  'text-[13px] text-muted'
                )}
              >
                {q}
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint mt-3">
            {isLoading ? 'Checking for an existing session…' : 'Connect a codebase above to start.'}
          </p>
        </section>
      </div>
    </AppShell>
  );
};

export default Workspace;
