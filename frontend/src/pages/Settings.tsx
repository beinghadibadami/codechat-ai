/**
 * Settings — connections, appearance, and the active session.
 *
 * Everything here reflects real server or client state; nothing is decorative.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Github,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  XCircle,
  Trash2,
  Database,
  Cpu,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const Row: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="flex items-start justify-between gap-4 px-3.5 py-3">
    <div className="min-w-0">
      <p className="text-[13px] font-medium">{label}</p>
      {hint && <p className="text-xs text-muted mt-0.5 leading-relaxed">{hint}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, icon: Icon, children }) => (
  <section className="mt-7">
    <h2 className="flex items-center gap-1.5 text-sm font-medium mb-2.5">
      <Icon className="w-3.5 h-3.5 text-faint" aria-hidden />
      {title}
    </h2>
    <div className="border border-border rounded-md divide-y divide-border bg-panel/40">
      {children}
    </div>
  </section>
);

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { sessionInfo, hasData, repoName, sourceType, resetSession } = useSession();
  const github = useGithubAuth();
  const { toast } = useToast();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-9">
        <p className="tag-mono mb-2">settings</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        {/* Appearance */}
        <Section title="Appearance" icon={Sun}>
          <Row label="Theme" hint="Saved between sessions.">
            <div
              className="flex rounded-sm border border-border overflow-hidden"
              role="group"
              aria-label="Theme"
            >
              {THEMES.map(({ value, label, Icon }) => {
                const active = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 h-7 text-xs interactive',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted hover:text-foreground hover:bg-raised/60'
                    )}
                  >
                    <Icon className="w-3 h-3" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          </Row>
        </Section>

        {/* Connections */}
        <Section title="Connections" icon={Github}>
          <Row
            label="GitHub"
            hint={
              github.configured
                ? 'Needed for private repositories and pull requests.'
                : 'OAuth is not configured on this server. Personal access tokens still work.'
            }
          >
            {github.connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-cyan">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                  <span className="font-mono">@{github.user ?? 'connected'}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={github.disconnect}
                  className="h-7 text-2xs"
                >
                  Disconnect
                </Button>
              </div>
            ) : github.configured ? (
              <Button size="sm" onClick={github.connect} className="h-7 text-2xs gap-1.5">
                <Github className="w-3 h-3" aria-hidden />
                Connect
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-faint">
                <XCircle className="w-3.5 h-3.5" aria-hidden />
                Unavailable
              </span>
            )}
          </Row>
        </Section>

        {/* Active session */}
        <Section title="Active session" icon={Database}>
          <Row label="Codebase" hint={hasData ? undefined : 'Nothing indexed right now.'}>
            {hasData ? (
              <span className="font-mono text-xs">{repoName ?? 'Untitled'}</span>
            ) : (
              <Button size="sm" variant="outline" asChild className="h-7 text-2xs">
                <Link to="/">Connect</Link>
              </Button>
            )}
          </Row>

          {hasData && (
            <>
              <Row label="Source">
                <span className="font-mono text-xs text-muted">
                  {sourceType === 'github' ? 'github' : 'local upload'}
                </span>
              </Row>
              <Row label="Files indexed">
                <span className="font-mono text-xs text-muted tabular-nums">
                  {sessionInfo?.files_processed ?? 0}
                </span>
              </Row>
              <Row label="Namespace" hint="Isolates your vectors from other sessions.">
                <span className="font-mono text-2xs text-faint">
                  {sessionInfo?.namespace?.slice(0, 8)}…
                </span>
              </Row>
              <Row
                label="Disconnect codebase"
                hint="Removes the indexed files. Shared links keep working."
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm('Disconnect this codebase?')) return;
                    await resetSession();
                    toast({ title: 'Codebase disconnected' });
                  }}
                  className="h-7 text-2xs gap-1.5"
                >
                  <Trash2 className="w-3 h-3" aria-hidden />
                  Disconnect
                </Button>
              </Row>
            </>
          )}
        </Section>

        {/* Retrieval — read-only server capabilities */}
        {sessionInfo?.features && (
          <Section title="Retrieval" icon={Cpu}>
            {Object.entries(sessionInfo.features).map(([key, enabled]) => (
              <Row key={key} label={key.replace(/_/g, ' ')}>
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    enabled ? 'text-cyan' : 'text-faint'
                  )}
                >
                  {enabled ? (
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {enabled ? 'on' : 'off'}
                </span>
              </Row>
            ))}
          </Section>
        )}
      </div>
    </AppShell>
  );
};

export default Settings;
