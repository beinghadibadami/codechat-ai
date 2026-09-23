/**
 * Shared — manage read-only links to conversations.
 *
 * The backend doesn't keep a per-user index of shares (there are no accounts
 * yet), so we track the ones created in this browser locally. That's honest
 * about the limitation rather than pretending to list every share.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Copy, Check, ExternalLink, Trash2, Info } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/contexts/SessionContext';
import { readShares, forgetShare, type ShareRecord } from '@/lib/shares';

const Shared: React.FC = () => {
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasData } = useSession();

  useEffect(() => {
    setRecords(readShares());
  }, []);

  const copy = async (id: string) => {
    const url = `${window.location.origin}/s/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast({ title: 'Copy failed', description: url });
    }
  };

  const forget = (id: string) => {
    setRecords(forgetShare(id));
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-9">
        <p className="tag-mono mb-2">shared</p>
        <h1 className="text-2xl font-semibold tracking-tight">Shared sessions</h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed max-w-lg">
          A share is a frozen copy of a conversation. Anyone with the link can read the
          questions, answers and citations, and ask their own follow-ups — but they can't
          change your session or the indexed source.
        </p>

        {/* Local-only caveat */}
        <div className="flex items-start gap-2 mt-5 px-3 py-2.5 rounded-md border border-border bg-raised/40">
          <Info className="w-3.5 h-3.5 text-cyan shrink-0 mt-px" aria-hidden />
          <p className="text-xs text-muted leading-relaxed">
            This list is kept in your browser. Links keep working if you clear it — you'd
            just need the URL.
          </p>
        </div>

        {records.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={Share2}
              title="No shares yet"
              description={
                hasData
                  ? 'Open a conversation and use Share in the top bar to create a read-only link.'
                  : 'Connect a codebase and have a conversation first, then share it.'
              }
              action={
                <Button size="sm" asChild className="h-8 text-xs">
                  <Link to={hasData ? '/chat' : '/'}>
                    {hasData ? 'Go to chat' : 'Connect a codebase'}
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="mt-7 border border-border rounded-md divide-y divide-border overflow-hidden">
            {records.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-raised/30">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs truncate">{r.repoName ?? 'Untitled session'}</p>
                  <p className="font-mono text-2xs text-faint mt-0.5">
                    /s/{r.id.slice(0, 8)} · {r.messageCount} message
                    {r.messageCount === 1 ? '' : 's'} ·{' '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void copy(r.id)}
                    className="w-7 h-7 grid place-items-center rounded-sm text-faint
                               hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                    aria-label="Copy share link"
                    title="Copy link"
                  >
                    {copiedId === r.id ? (
                      <Check className="w-3.5 h-3.5 text-cyan" aria-hidden />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden />
                    )}
                  </button>
                  <Link
                    to={`/s/${r.id}`}
                    className="w-7 h-7 grid place-items-center rounded-sm text-faint
                               hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                    aria-label="Open shared session"
                    title="Open"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => forget(r.id)}
                    className="w-7 h-7 grid place-items-center rounded-sm text-faint
                               hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring
                               focus-visible:outline-none"
                    aria-label="Remove from this list"
                    title="Remove from list"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
};

export default Shared;
