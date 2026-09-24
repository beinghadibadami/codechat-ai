/**
 * Pulls — PR-aware workspace.
 *
 * Left: list of pull requests on the connected repo.
 * Right: the selected diff, plus a focused chat that has both the diff and the
 *        indexed codebase as context (so "what could this break?" is answerable).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitPullRequestClosed,
  GitMerge,
  Loader2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Send,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DiffViewer } from '@/components/pulls/DiffViewer';
import { MessageFormatter } from '@/components/MessageFormatter';
import { CodePreview, PreviewTarget } from '@/components/workspace/CodePreview';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { useSession } from '@/contexts/SessionContext';
import { apiService, PullSummary, PullDetail, ChatSource } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Citation } from '@/components/FileViewer';

interface PRMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

const PR_PROMPTS = [
  'What does this change do?',
  'What could break?',
  'Is anything missing a test?',
];

const Pulls: React.FC = () => {
  const { hasData, isLoading, sourceType, repoUrl } = useSession();
  const { toast } = useToast();

  const [list, setList] = useState<PullSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [urlInput, setUrlInput] = useState('');

  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [messages, setMessages] = useState<PRMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [target, setTarget] = useState<PreviewTarget | null>(null);

  // ---- List -------------------------------------------------------------
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await apiService.listPulls(state);
      setList(res.pulls);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load pull requests');
    } finally {
      setListLoading(false);
    }
  }, [state]);

  useEffect(() => {
    if (hasData && sourceType === 'github') void loadList();
  }, [hasData, sourceType, loadList]);

  // ---- Detail -----------------------------------------------------------
  const openPull = useCallback(async (number: number) => {
    setSelected(number);
    setDetail(null);
    setMessages([]);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiService.getPull(number);
      setDetail(res);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Could not load that pull request');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openByUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      const res = await apiService.resolvePullUrl(url);
      setUrlInput('');
      await openPull(res.number);
    } catch (e) {
      toast({
        title: 'Not a pull request link',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  // ---- Chat about the diff ---------------------------------------------
  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || !selected || asking) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: q }]);
    setQuestion('');
    setAsking(true);
    try {
      const history = messages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      const res = await apiService.chatAboutPull(selected, q, history);
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.response,
          sources: res.metadata?.sources,
        },
      ]);
    } catch (e) {
      toast({
        title: 'Could not answer',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setAsking(false);
    }
  };

  const runReview = async () => {
    if (!selected || asking) return;
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: 'Review this pull request' },
    ]);
    setAsking(true);
    try {
      const res = await apiService.reviewPull(selected);
      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: res.response },
      ]);
    } catch (e) {
      toast({
        title: 'Review failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setAsking(false);
    }
  };

  const onCitation = useCallback((c: Citation) => {
    setTarget({ path: c.file, lineStart: c.lineStart, lineEnd: c.lineEnd });
  }, []);

  // ---- Guards -----------------------------------------------------------
  if (!isLoading && !hasData) return <Navigate to="/app" replace />;

  if (!isLoading && sourceType !== 'github') {
    return (
      <AppShell>
        <div className="h-full grid place-items-center">
          <EmptyState
            icon={GitPullRequest}
            title="Pull requests need a GitHub repository"
            description="This session was created from local file uploads, so there's no remote to read pull requests from. Connect a repository to use this view."
            action={
              <Button size="sm" asChild className="h-8 text-xs">
                <Link to="/app">Connect a repository</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const stateIcon = (s: string, merged?: boolean) =>
    merged ? GitMerge : s === 'closed' ? GitPullRequestClosed : GitPullRequest;

  // ---- List pane --------------------------------------------------------
  const listPane = (
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header shrink-0">
        <span className="tag-mono">pull requests</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void loadList()}
          disabled={listLoading}
          className="h-6 w-6 p-0"
          aria-label="Refresh list"
        >
          <RefreshCw className={cn('w-3 h-3', listLoading && 'animate-spin')} aria-hidden />
        </Button>
      </div>

      {/* Filters + direct URL */}
      <div className="p-2 border-b border-border space-y-2 shrink-0">
        <Tabs value={state} onValueChange={v => setState(v as typeof state)}>
          <TabsList className="h-7 w-full bg-raised/60">
            {(['open', 'closed', 'all'] as const).map(s => (
              <TabsTrigger key={s} value={s} className="text-2xs h-5 flex-1 capitalize">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-1.5">
          <Input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void openByUrl()}
            placeholder="Paste a PR link…"
            aria-label="Open a pull request by URL"
            className="h-7 text-xs font-mono bg-raised/50"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void openByUrl()}
            disabled={!urlInput.trim()}
            className="h-7 px-2 text-2xs shrink-0"
          >
            Open
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {listLoading && (
          <div className="p-2.5 space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            ))}
          </div>
        )}

        {!listLoading && listError && (
          <ErrorState compact message={listError} onRetry={() => void loadList()} className="m-2.5" />
        )}

        {!listLoading && !listError && list.length === 0 && (
          <EmptyState
            icon={GitPullRequest}
            title={`No ${state} pull requests`}
            description="Paste a pull request link above to open one directly."
            className="py-10"
          />
        )}

        <ul className="divide-y divide-border/60">
          {list.map(pr => {
            const Icon = stateIcon(pr.state);
            const active = selected === pr.number;
            return (
              <li key={pr.number}>
                <button
                  type="button"
                  onClick={() => void openPull(pr.number)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 interactive',
                    active
                      ? 'bg-raised shadow-[inset_2px_0_0_hsl(var(--amber))]'
                      : 'hover:bg-raised/40'
                  )}
                  aria-current={active ? 'true' : undefined}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        'w-3.5 h-3.5 shrink-0 mt-0.5',
                        pr.state === 'open' ? 'text-cyan' : 'text-faint'
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug line-clamp-2">{pr.title}</p>
                      <p className="font-mono text-2xs text-faint mt-1">
                        #{pr.number} · {pr.author ?? 'unknown'}
                        {pr.draft ? ' · draft' : ''}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  // ---- Detail pane ------------------------------------------------------
  const detailPane = (
    <div className="flex flex-col h-full min-h-0">
      {!selected && (
        <div className="h-full grid place-items-center">
          <EmptyState
            icon={GitPullRequest}
            title="Pick a pull request"
            description="Select one from the list, or paste a link, to read the diff and ask about it."
            hints={PR_PROMPTS}
          />
        </div>
      )}

      {selected && detailLoading && (
        <div className="h-full grid place-items-center" role="status">
          <span className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            Fetching #{selected}
          </span>
        </div>
      )}

      {selected && !detailLoading && detailError && (
        <div className="h-full grid place-items-center">
          <ErrorState message={detailError} onRetry={() => void openPull(selected)} />
        </div>
      )}

      {detail && !detailLoading && (
        <>
          {/* PR metadata */}
          <div className="shrink-0 px-4 py-3 border-b border-border bg-panel/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-sm font-medium leading-snug">{detail.title}</h1>
                <p className="font-mono text-2xs text-faint mt-1.5">
                  #{detail.number} · {detail.author} · {detail.head} → {detail.base} ·{' '}
                  <span className="text-cyan">+{detail.additions}</span>{' '}
                  <span className="text-amber">-{detail.deletions}</span> ·{' '}
                  {detail.changed_files} file{detail.changed_files === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runReview()}
                  disabled={asking}
                  className="h-7 px-2 text-2xs gap-1"
                >
                  <Sparkles className="w-3 h-3" aria-hidden />
                  Review
                </Button>
                {detail.url && (
                  <a
                    href={detail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 grid place-items-center rounded-sm text-faint
                               hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                    aria-label="Open on GitHub"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Diff + conversation */}
          <Tabs defaultValue="diff" className="flex-1 flex flex-col min-h-0">
            <TabsList className="shrink-0 mx-4 mt-2.5 h-7 w-fit bg-raised/60">
              <TabsTrigger value="diff" className="text-2xs h-5">
                Diff
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-2xs h-5">
                Ask {messages.length > 0 && `(${Math.ceil(messages.length / 2)})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diff" className="flex-1 overflow-y-auto min-h-0 mt-2.5">
              <DiffViewer
                files={detail.files}
                comments={detail.comments}
                onOpenLine={(path, line) => setTarget({ path, lineStart: line })}
              />
            </TabsContent>

            <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-2.5">
              <div className="flex-1 overflow-y-auto min-h-0 px-4">
                {messages.length === 0 ? (
                  <div className="py-8">
                    <p className="tag-mono mb-2">try</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {PR_PROMPTS.map(p => (
                        <li key={p}>
                          <button
                            type="button"
                            onClick={() => void ask(p)}
                            className="px-2 py-1 rounded-sm border border-border bg-raised/60
                                       text-xs text-muted hover:text-foreground
                                       hover:border-border-elevated interactive
                                       focus-visible:ring-2 focus-visible:ring-ring
                                       focus-visible:outline-none"
                          >
                            {p}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ul className="space-y-4 py-3">
                    {messages.map(m => (
                      <li key={m.id}>
                        <span
                          className={cn(
                            'tag-mono block mb-1',
                            m.role === 'user' ? 'text-faint' : 'text-primary/70'
                          )}
                        >
                          {m.role === 'user' ? 'you' : 'codechat'}
                        </span>
                        {m.role === 'user' ? (
                          <p className="text-[13.5px] leading-relaxed">{m.content}</p>
                        ) : (
                          <MessageFormatter
                            content={m.content}
                            sources={m.sources}
                            onCitationClick={onCitation}
                          />
                        )}
                      </li>
                    ))}
                    {asking && (
                      <li className="flex items-center gap-2 text-xs text-muted" role="status">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        Reading the diff
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* PR composer */}
              <div className="shrink-0 border-t border-border p-3">
                <div className="relative">
                  <Textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void ask(question);
                      }
                    }}
                    placeholder="Ask about this change…"
                    rows={1}
                    disabled={asking}
                    aria-label="Ask about this pull request"
                    className="min-h-[2.25rem] max-h-28 resize-none text-[13px] pr-10
                               bg-raised/50 border-border"
                  />
                  <Button
                    size="sm"
                    onClick={() => void ask(question)}
                    disabled={!question.trim() || asking}
                    className="absolute right-1.5 bottom-1.5 h-6 w-6 p-0"
                    aria-label="Send"
                  >
                    <Send className="w-3 h-3" aria-hidden />
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );

  return (
    <AppShell scroll={false}>
      {/* Desktop split */}
      <div className="hidden lg:grid grid-cols-[19rem_1fr] h-full">
        <div className="border-r border-border bg-panel min-h-0">{listPane}</div>
        <div className="min-h-0">{detailPane}</div>
      </div>

      {/* Mobile: list until one is picked */}
      <div className="lg:hidden h-full">
        {selected ? (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-2 py-1.5 border-b border-border bg-panel/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
                className="h-7 text-xs"
              >
                All pull requests
              </Button>
            </div>
            <div className="flex-1 min-h-0">{detailPane}</div>
          </div>
        ) : (
          listPane
        )}
      </div>

      {/* Line → source */}
      <Sheet open={Boolean(target)} onOpenChange={open => !open && setTarget(null)}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-2xl border-border">
          <CodePreview
            target={target}
            repoUrl={repoUrl}
            headerAction={
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="w-6 h-6 grid place-items-center rounded-sm text-faint
                           hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                           focus-visible:outline-none"
                aria-label="Close"
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            }
          />
        </SheetContent>
      </Sheet>
    </AppShell>
  );
};

export default Pulls;
