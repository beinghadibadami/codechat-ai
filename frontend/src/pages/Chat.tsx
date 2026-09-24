/**
 * Chat — the product.
 *
 * The conversation is the whole screen. Reading source and browsing the tree
 * are both on-demand overlays rather than permanent panes: a file only matters
 * once you've asked something that points at it, and diagrams now render inside
 * answers, so neither needs to occupy layout by default.
 *
 * Query params:
 *   ?q=<question>  auto-sends once on mount (used by workspace jump-offs)
 *   ?file=<path>   opens that file in the source panel (used by ⌘K)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Trash2,
  Download,
  X,
  FolderTree,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileExplorer } from '@/components/workspace/FileExplorer';
import { CodePreview, PreviewTarget } from '@/components/workspace/CodePreview';
import { MessageRow } from '@/components/chat/MessageRow';
import { Composer } from '@/components/chat/Composer';
import { EmptyState } from '@/components/states/EmptyState';
import { useSession } from '@/contexts/SessionContext';
import { useChat } from '@/hooks/useChat';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';
import { exportChatAsMarkdown, exportChatAsJSON } from '@/lib/exportChat';
import { rememberShare } from '@/lib/shares';
import type { Citation } from '@/components/FileViewer';

const Chat: React.FC = () => {
  const { hasData, isLoading, fileTree, repoName, repoUrl, sourceType, sessionInfo } =
    useSession();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const {
    messages,
    isLoaded,
    input,
    setInput,
    streaming,
    error,
    submit,
    send,
    stop,
    retry,
    explainFile,
    clearMessages,
  } = useChat();

  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  /** Guards the ?q= auto-send so it can't re-fire on re-render. */
  const autoSent = useRef(false);

  const conversation = messages.filter(m => !m.id.startsWith('welcome'));
  const isEmpty = isLoaded && conversation.length === 0;

  // Keep the newest turn in view while streaming
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' });
  }, [messages, streaming]);

  /** Open a file in the source overlay. */
  const openTarget = useCallback((t: PreviewTarget) => {
    setTarget(t);
    setSourceOpen(true);
  }, []);

  const onCitation = useCallback(
    (c: Citation) => openTarget({ path: c.file, lineStart: c.lineStart, lineEnd: c.lineEnd }),
    [openTarget]
  );

  // Consume ?q= once the session is ready, then strip it from the URL so a
  // refresh doesn't resend.
  useEffect(() => {
    const q = params.get('q');
    if (!q || autoSent.current || !hasData || !isLoaded) return;
    autoSent.current = true;
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
    void send(q);
  }, [params, hasData, isLoaded, send, setParams]);

  // Consume ?file= to open the source panel directly
  useEffect(() => {
    const file = params.get('file');
    if (!file) return;
    openTarget({ path: file });
    const next = new URLSearchParams(params);
    next.delete('file');
    setParams(next, { replace: true });
  }, [params, openTarget, setParams]);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await apiService.createShare({
        repo_url: repoUrl ?? undefined,
        repo_name: repoName ?? undefined,
        messages: conversation.map(m => ({
          role: m.type,
          content: m.content,
          metadata: m.metadata,
        })),
      });

      rememberShare({
        id: res.share_id,
        repoName: repoName ?? null,
        createdAt: new Date().toISOString(),
        messageCount: conversation.length,
      });

      const url = `${window.location.origin}/s/${res.share_id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Share link copied', description: url });
      } catch {
        toast({ title: 'Share link ready', description: url });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create a share link';
      toast({
        title: 'Share failed',
        description: /configured|supabase/i.test(msg)
          ? 'Sharing is not configured on this server.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSharing(false);
    }
  };

  if (!isLoading && !hasData) return <Navigate to="/app" replace />;

  const topActions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setFilesOpen(true)}
        className="h-8 w-8 p-0"
        aria-label="Browse files"
        title="Browse files"
      >
        <FolderTree className="w-4 h-4" aria-hidden />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!conversation.length}
            aria-label="Export conversation"
          >
            <Download className="w-4 h-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-xs" onClick={() => exportChatAsMarkdown(messages)}>
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onClick={() => exportChatAsJSON(messages)}>
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!conversation.length) return;
          if (!window.confirm('Clear this conversation? This cannot be undone.')) return;
          clearMessages();
          toast({ title: 'Conversation cleared' });
        }}
        disabled={!conversation.length}
        className="h-8 w-8 p-0"
        aria-label="Clear conversation"
      >
        <Trash2 className="w-4 h-4" aria-hidden />
      </Button>
    </>
  );

  return (
    <AppShell
      scroll={false}
      actions={topActions}
      onShare={handleShare}
      shareDisabled={sharing || !conversation.length}
    >
      <div className="flex flex-col h-full min-h-0 bg-background">
        {/* Session strip */}
        <div className="shrink-0 h-9 flex items-center gap-2 px-4 sm:px-5 border-b border-border bg-panel/40">
          <MessageSquare className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
          <h1 className="text-xs font-medium truncate">{repoName ?? 'Conversation'}</h1>
          <span className="tag-mono shrink-0">
            {sourceType === 'github' ? 'github' : 'local'}
          </span>
          <span className="tag-mono ml-auto shrink-0 hidden sm:inline">
            {sessionInfo?.files_processed ?? 0} files indexed
          </span>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isEmpty ? (
            <div className="h-full grid place-items-center px-4">
              <EmptyState
                icon={Sparkles}
                title={`Ask anything about ${repoName ?? 'this codebase'}`}
                description="Answers cite the file and line they came from, and structural questions come back as diagrams."
                hints={['click a citation to read the source', 'mention #412 to pull in a PR diff']}
              />
            </div>
          ) : (
            <>
              {conversation.map((m, i) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  onCitationClick={onCitation}
                  onOpenSource={onCitation}
                  streaming={
                    streaming && i === conversation.length - 1 && m.type === 'assistant'
                  }
                />
              ))}
              <div ref={endRef} className="h-4" />
            </>
          )}
        </div>

        {/* Composer */}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
          streaming={streaming}
          showSuggestions={isEmpty}
          onPickSuggestion={p => void send(p)}
          error={error}
          onRetry={retry}
        />
      </div>

      {/* Source — opens from a citation or the ⌘K file search */}
      <Sheet open={sourceOpen} onOpenChange={setSourceOpen}>
        <SheetContent
          side="right"
          className="p-0 w-full sm:w-[92vw] sm:max-w-3xl border-border"
        >
          <CodePreview
            target={target}
            repoUrl={repoUrl}
            headerAction={
              <button
                type="button"
                onClick={() => setSourceOpen(false)}
                className="w-6 h-6 grid place-items-center rounded-sm text-faint
                           hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                           focus-visible:outline-none"
                aria-label="Close source panel"
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            }
          />
        </SheetContent>
      </Sheet>

      {/* File tree — available but never in the way */}
      <Sheet open={filesOpen} onOpenChange={setFilesOpen}>
        <SheetContent side="left" className="p-0 w-[86vw] max-w-sm border-border">
          <FileExplorer
            tree={fileTree}
            loading={isLoading}
            selectedPath={target?.path ?? null}
            onSelect={path => {
              setFilesOpen(false);
              openTarget({ path });
            }}
            onExplain={path => {
              setFilesOpen(false);
              void explainFile(path);
            }}
          />
        </SheetContent>
      </Sheet>
    </AppShell>
  );
};

export default Chat;
