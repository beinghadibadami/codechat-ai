/**
 * Chat — the central workspace.
 *
 * Desktop  : files | conversation | source preview (resizable)
 * Tablet   : conversation + collapsible side panels
 * Mobile   : conversation only; files and source open in sheets
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  PanelLeft,
  PanelRight,
  Trash2,
  Download,
  X,
  FolderTree,
  FileCode,
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
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
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
  const { hasData, isLoading, fileTree, repoName, repoUrl, sourceType, sessionInfo } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

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
  const [showFiles, setShowFiles] = useState(true);
  const [showSource, setShowSource] = useState(true);
  const [filesSheet, setFilesSheet] = useState(false);
  const [sourceSheet, setSourceSheet] = useState(false);
  const [sharing, setSharing] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  // Welcome placeholders are filtered out everywhere the real turns matter
  const conversation = messages.filter(m => !m.id.startsWith('welcome'));
  const isEmpty = isLoaded && conversation.length === 0;

  // Keep the newest turn in view while streaming
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' });
  }, [messages, streaming]);

  /** Opening a file: pane on desktop, sheet on small screens. */
  const openTarget = useCallback((t: PreviewTarget) => {
    setTarget(t);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setSourceSheet(true);
    } else {
      setShowSource(true);
    }
  }, []);

  const onCitation = useCallback(
    (c: Citation) => openTarget({ path: c.file, lineStart: c.lineStart, lineEnd: c.lineEnd }),
    [openTarget]
  );

  const onSelectFile = useCallback(
    (path: string) => {
      openTarget({ path });
      setFilesSheet(false);
    },
    [openTarget]
  );

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await apiService.createShare({
        repo_url: repoUrl ?? undefined,
        repo_name: repoName ?? undefined,
        messages: messages
          .filter(m => !m.id.startsWith('welcome'))
          .map(m => ({ role: m.type, content: m.content, metadata: m.metadata })),
      });
      // Track it locally so /shared can list it (no accounts yet)
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

  // Redirect if there's nothing to talk to
  if (!isLoading && !hasData) return <Navigate to="/" replace />;

  const topActions = (
    <>
      {/* Pane toggles — desktop */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowFiles(v => !v)}
        className="hidden lg:inline-flex h-8 w-8 p-0"
        aria-label={showFiles ? 'Hide file explorer' : 'Show file explorer'}
        aria-pressed={showFiles}
        title="Toggle file explorer"
      >
        <PanelLeft className="w-4 h-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowSource(v => !v)}
        className="hidden lg:inline-flex h-8 w-8 p-0"
        aria-label={showSource ? 'Hide source panel' : 'Show source panel'}
        aria-pressed={showSource}
        title="Toggle source panel"
      >
        <PanelRight className="w-4 h-4" aria-hidden />
      </Button>

      {/* Sheet triggers — mobile / tablet */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setFilesSheet(true)}
        className="lg:hidden h-8 w-8 p-0"
        aria-label="Open file explorer"
      >
        <FolderTree className="w-4 h-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSourceSheet(true)}
        className="lg:hidden h-8 w-8 p-0"
        aria-label="Open source panel"
        disabled={!target}
      >
        <FileCode className="w-4 h-4" aria-hidden />
      </Button>

      {/* Export */}
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

      {/* Clear */}
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

  /** The middle column: header strip, messages, composer. */
  const conversationPane = (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Session strip */}
      <div className="shrink-0 h-9 flex items-center gap-2 px-4 sm:px-5 border-b border-border bg-panel/40">
        <MessageSquare className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
        <h1 className="text-xs font-medium truncate">
          {repoName ?? 'Conversation'}
        </h1>
        <span className="tag-mono shrink-0">
          {sourceType === 'github' ? 'github' : 'local'}
        </span>
        <span className="tag-mono ml-auto shrink-0 hidden sm:inline">
          {sessionInfo?.files_processed ?? 0} indexed
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isEmpty ? (
          <div className="h-full grid place-items-center">
            <EmptyState
              icon={MessageSquare}
              title="Ask the first question"
              description={
                <>
                  This codebase is indexed and ready. Ask how something works, what a
                  change affects, or where a value is validated.
                </>
              }
              hints={['answers cite file and line', 'reference a PR with #123']}
            />
          </div>
        ) : (
          <>
            {conversation.map((m, i) => {
              const isLast = i === conversation.length - 1;
              return (
                <MessageRow
                  key={m.id}
                  message={m}
                  onCitationClick={onCitation}
                  onOpenSource={onCitation}
                  streaming={streaming && isLast && m.type === 'assistant'}
                />
              );
            })}
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
  );

  return (
    <AppShell
      scroll={false}
      actions={topActions}
      onShare={handleShare}
      shareDisabled={sharing || !conversation.length}
    >
      {/* Desktop: resizable three-pane */}
      <div className="hidden lg:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {showFiles && (
            <>
              <ResizablePanel defaultSize={19} minSize={13} maxSize={32} className="bg-panel">
                <FileExplorer
                  tree={fileTree}
                  loading={isLoading}
                  selectedPath={target?.path ?? null}
                  onSelect={onSelectFile}
                  onExplain={explainFile}
                />
              </ResizablePanel>
              <ResizableHandle className="bg-border hover:bg-border-elevated transition-colors" />
            </>
          )}

          <ResizablePanel defaultSize={showSource ? 51 : 81} minSize={32}>
            {conversationPane}
          </ResizablePanel>

          {showSource && (
            <>
              <ResizableHandle className="bg-border hover:bg-border-elevated transition-colors" />
              <ResizablePanel defaultSize={30} minSize={20} maxSize={48} className="bg-panel">
                <CodePreview target={target} repoUrl={repoUrl} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Tablet / mobile: conversation only, panels in sheets */}
      <div className="lg:hidden h-full">{conversationPane}</div>

      <Sheet open={filesSheet} onOpenChange={setFilesSheet}>
        <SheetContent side="left" className="p-0 w-[85vw] max-w-sm border-border">
          <FileExplorer
            tree={fileTree}
            loading={isLoading}
            selectedPath={target?.path ?? null}
            onSelect={onSelectFile}
            onExplain={path => {
              setFilesSheet(false);
              void explainFile(path);
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={sourceSheet} onOpenChange={setSourceSheet}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-2xl border-border">
          <CodePreview
            target={target}
            repoUrl={repoUrl}
            headerAction={
              <button
                type="button"
                onClick={() => setSourceSheet(false)}
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
    </AppShell>
  );
};

export default Chat;
