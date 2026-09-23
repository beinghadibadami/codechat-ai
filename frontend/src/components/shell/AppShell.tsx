/**
 * AppShell — the layout every workspace route renders inside.
 *
 * Desktop: persistent sidebar + top bar + content.
 * Tablet/mobile: sidebar moves into a drawer, top bar gains a menu trigger.
 *
 * Pages supply their own `actions` / `onShare` via <AppShell> props so the top
 * bar stays consistent without every page re-implementing it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';

const COLLAPSE_KEY = 'codechat-sidebar-collapsed';

interface Props {
  children: React.ReactNode;
  /** Extra buttons for the top bar (page-specific) */
  actions?: React.ReactNode;
  onShare?: () => void;
  shareDisabled?: boolean;
  /**
   * Pages that manage their own internal scrolling (chat, files) set this to
   * false so the shell doesn't add a second scroll container.
   */
  scroll?: boolean;
}

export const AppShell: React.FC<Props> = ({
  children,
  actions,
  onShare,
  shareDisabled,
  scroll = true,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — collapse still works for this session */
      }
      return next;
    });
  }, []);

  // Cmd/Ctrl+K opens the palette from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden bg-background text-foreground">
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only-focusable absolute z-50 top-2 left-2 px-3 py-1.5 rounded-sm
                   bg-primary text-primary-foreground text-xs font-medium"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      {/* Mobile / tablet drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-sidebar border-border">
          <Sidebar
            collapsed={false}
            onToggleCollapsed={toggleCollapsed}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCommand={() => setCommandOpen(true)}
          actions={actions}
          onShare={onShare}
          shareDisabled={shareDisabled}
        />

        <main
          id="main-content"
          className={
            scroll
              ? 'flex-1 overflow-y-auto min-h-0'
              : 'flex-1 min-h-0 overflow-hidden'
          }
        >
          {children}
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
};
