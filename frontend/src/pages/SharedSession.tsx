/**
 * SharedSession — public read-only view of a conversation at /s/:id
 *
 * Deliberately outside AppShell: a visitor has no session of their own, so
 * workspace navigation would be misleading. They get the conversation, working
 * citations, and the option to ask their own follow-up (which queries the same
 * indexed source but is never written back to the share).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  Github,
  Eye,
  Send,
  ArrowLeft,
  Lock,
  HardDrive,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageFormatter } from '@/components/MessageFormatter';
import { FileViewer, Citation } from '@/components/FileViewer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { apiService, ChatSource } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SharedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: { sources?: ChatSource[]; chunks_found?: number };
  /** Marks turns added by this visitor, which are not part of the share */
  local?: boolean;
}

interface ShareMeta {
  id: string;
  repoUrl: string | null;
  repoName: string | null;
  viewCount: number;
  createdAt: string;
  totalFiles: number;
}

const SharedSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [messages, setMessages] = useState<SharedMessage[]>([]);

  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [citation, setCitation] = useState<Citation | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      setError('This share link is missing an id.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.getShare(id);
        if (cancelled) return;
        setMeta({
          id: data.id,
          repoUrl: data.repo_url,
          repoName: data.repo_name,
          viewCount: data.view_count,
          createdAt: data.created_at,
          totalFiles: data.total_files,
        });
        setMessages(
          data.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata,
          }))
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this share');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const ask = async () => {
    const q = input.trim();
    if (!q || !id || asking) return;

    setInput('');
    setMessages(prev => [
      ...prev,
      { id: `local-u-${Date.now()}`, role: 'user', content: q, local: true },
    ]);
    setAsking(true);

    try {
      const history = messages
        .slice(-4)
        .map(m => ({ role: m.role, content: m.content }));
      const res = await apiService.chatOnShare(id, q, history);
      setMessages(prev => [
        ...prev,
        {
          id: `local-a-${Date.now()}`,
          role: 'assistant',
          content: res.response,
          metadata: res.metadata,
          local: true,
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

  // ---- Loading / error --------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background" role="status">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading shared conversation
        </span>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <ErrorState
          kind="not-found"
          message={error ?? undefined}
          action={
            <Button size="sm" asChild className="h-8 text-xs gap-1.5">
              <Link to="/">
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
                Go to gitchat
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const SourceIcon = meta.repoUrl ? Github : HardDrive;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <FileViewer
        citation={citation}
        onClose={() => setCitation(null)}
        repoUrl={meta.repoUrl}
      />

      {/* Header */}
      <header className="shrink-0 border-b border-border bg-panel/70 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-5 h-topbar flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <SourceIcon className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
              <span className="font-mono text-xs truncate">
                {meta.repoName ?? 'Shared conversation'}
              </span>
              <span
                className="flex items-center gap-1 tag-mono shrink-0 ml-1"
                title="This conversation is read-only"
              >
                <Lock className="w-2.5 h-2.5" aria-hidden />
                read-only
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-2xs text-faint">
                <Eye className="w-2.5 h-2.5" aria-hidden />
                {meta.viewCount} view{meta.viewCount === 1 ? '' : 's'}
              </span>
              {meta.totalFiles > 0 && (
                <span className="flex items-center gap-1 text-2xs text-faint">
                  <FileCode className="w-2.5 h-2.5" aria-hidden />
                  {meta.totalFiles} files
                </span>
              )}
              {meta.repoUrl && (
                <a
                  href={meta.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-2xs text-cyan hover:underline truncate max-w-[14rem]"
                >
                  {meta.repoUrl.replace('https://github.com/', '')}
                </a>
              )}
            </div>
          </div>

          <ThemeToggle className="h-8 w-8 p-0 shrink-0" />
          <Button size="sm" variant="outline" asChild className="h-8 text-xs shrink-0">
            <Link to="/">Open gitchat</Link>
          </Button>
        </div>
      </header>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <EmptyState
            icon={FileCode}
            title="This share has no messages"
            description="The conversation was shared before any questions were asked."
          />
        ) : (
          <>
            {messages.map(m => (
              <article
                key={m.id}
                className={cn('message-row px-4 sm:px-5', m.role === 'user' && 'bg-raised/30')}
              >
                <div className="max-w-3xl mx-auto flex gap-3 sm:gap-4">
                  <div
                    className={cn(
                      'message-gutter hidden sm:block',
                      m.role === 'user' ? 'text-faint' : 'text-primary/70'
                    )}
                    aria-hidden
                  >
                    {m.role === 'user' ? 'asked' : 'gitchat'}
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.local && (
                      <span className="tag-mono block mb-1.5 text-cyan/70">
                        your follow-up · not saved to this share
                      </span>
                    )}
                    {m.role === 'user' ? (
                      <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    ) : (
                      <MessageFormatter
                        content={m.content}
                        sources={m.metadata?.sources}
                        onCitationClick={setCitation}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
            {asking && (
              <div className="max-w-3xl mx-auto px-4 sm:px-5 py-5" role="status">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  Reading the source
                </span>
              </div>
            )}
            <div ref={endRef} className="h-4" />
          </>
        )}
      </div>

      {/* Follow-up */}
      <div className="shrink-0 border-t border-border bg-panel/70 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-3">
          <p className="text-2xs text-faint mb-2">
            Ask your own question. It queries the same indexed source but is not added to
            this share.
          </p>
          <div className="relative">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder="Ask a follow-up…"
              rows={1}
              disabled={asking}
              aria-label="Ask a follow-up question"
              className="min-h-[2.5rem] max-h-32 resize-none text-[14px] pr-11 bg-raised/50"
            />
            <Button
              size="sm"
              onClick={() => void ask()}
              disabled={!input.trim() || asking}
              className="absolute right-1.5 bottom-1.5 h-7 w-7 p-0"
              aria-label="Send"
            >
              <Send className="w-3.5 h-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedSession;
