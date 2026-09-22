/**
 * SharedSession page — read-only view of a conversation at /s/:id
 *
 * Fetches the snapshot from /share/:id, renders each message using the
 * existing MessageFormatter, and offers an optional "Ask a follow-up"
 * input that hits /share/:id/chat (fresh queries against the same
 * Pinecone namespace, not persisted back to the share).
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Github, Eye, MessageSquare, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageFormatter } from '@/components/MessageFormatter';
import { FileViewer, Citation } from '@/components/FileViewer';
import { MessageSkeleton } from '@/components/LoadingSkeleton';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface SharedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  position: number;
  created_at: string;
}

const SharedSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{
    id: string;
    repo_url: string | null;
    repo_name: string | null;
    view_count: number;
    created_at: string;
  } | null>(null);
  const [messages, setMessages] = useState<SharedMessage[]>([]);

  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  // Load the share on mount
  useEffect(() => {
    if (!id) {
      setError('Invalid share URL');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await apiService.getShare(id);
        setShare({
          id: data.id,
          repo_url: data.repo_url,
          repo_name: data.repo_name,
          view_count: data.view_count,
          created_at: data.created_at,
        });
        setMessages(data.messages);
      } catch (e: any) {
        setError(e?.message || 'Failed to load shared conversation');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const askFollowup = async () => {
    if (!id || !input.trim() || asking) return;
    const text = input.trim();
    setInput('');
    setAsking(true);

    const userMsg: SharedMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      position: messages.length,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Include the last 4 turns as context — same idea as the main chat
      const history = messages
        .slice(-4)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await apiService.chatOnShare(id, text, history);
      const asstMsg: SharedMessage = {
        id: `local-${Date.now() + 1}`,
        role: 'assistant',
        content: res.response,
        metadata: res.metadata,
        position: messages.length + 1,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, asstMsg]);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to get a response',
        variant: 'destructive',
      });
    } finally {
      setAsking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading shared conversation...
        </div>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Shared conversation not found</h1>
          <p className="text-muted-foreground mb-4">
            {error || 'This share may have been deleted or the link is invalid.'}
          </p>
          <Link to="/">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* File viewer for citations */}
      <FileViewer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />

      {/* Header */}
      <div className="border-b border-border bg-background-elevated/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" aria-label="Home">
              <MessageSquare className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-semibold truncate">
                {share.repo_name || 'Shared conversation'}
              </h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {share.repo_url && (
                  <a
                    href={share.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Github className="w-3 h-3" />
                    <span className="truncate max-w-[240px]">{share.repo_url}</span>
                  </a>
                )}
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {share.view_count} views
                </span>
              </div>
            </div>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm">
              Try CodeChat AI
            </Button>
          </Link>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              This share has no messages yet.
            </p>
          )}
          {messages.map(m => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`message-bubble max-w-[80%] ${m.role === 'user' ? 'user' : 'assistant'}`}>
                {m.role === 'user' ? (
                  <div className="text-gray-100 whitespace-pre-wrap break-words">{m.content}</div>
                ) : (
                  <MessageFormatter
                    content={m.content}
                    sources={m.metadata?.sources}
                    onCitationClick={setActiveCitation}
                  />
                )}
              </div>
            </div>
          ))}
          {asking && <MessageSkeleton />}
        </div>
      </ScrollArea>

      {/* Follow-up input */}
      <div className="border-t border-border bg-background-elevated/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">
            You can ask a follow-up question — it queries the same codebase but won't be saved to the share.
          </p>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  askFollowup();
                }
              }}
              placeholder="Ask a follow-up... (Ctrl+Enter to send)"
              className="min-h-[44px] max-h-32 resize-none"
              disabled={asking}
            />
            <Button
              onClick={askFollowup}
              disabled={!input.trim() || asking}
              className="bg-gradient-primary"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedSession;
