/**
 * TopBar — compact, editor-like. Holds the active source, indexing status,
 * command shortcut, share action, theme toggle and account menu.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Share2, LogOut, Github, RotateCcw, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SourceBadge } from './SourceBadge';

interface Props {
  onOpenMobileNav: () => void;
  onOpenCommand: () => void;
  /** Rendered on the right, before theme/account — page-specific actions */
  actions?: React.ReactNode;
  /** Optional share handler; hidden when absent */
  onShare?: () => void;
  shareDisabled?: boolean;
}

export const TopBar: React.FC<Props> = ({
  onOpenMobileNav,
  onOpenCommand,
  actions,
  onShare,
  shareDisabled,
}) => {
  const { hasData, resetSession } = useSession();
  const github = useGithubAuth();
  const navigate = useNavigate();

  const handleReset = async () => {
    if (!window.confirm('Disconnect this codebase and start over?')) return;
    await resetSession();
    navigate('/');
  };

  return (
    <header
      className="h-topbar shrink-0 flex items-center gap-2 px-2 sm:px-3
                 border-b border-border bg-panel/80 backdrop-blur-sm"
    >
      {/* Mobile nav trigger */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenMobileNav}
        className="lg:hidden shrink-0 h-8 w-8 p-0"
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4" aria-hidden />
      </Button>

      {/* Active source */}
      <div className="min-w-0 flex-1">
        <SourceBadge variant="inline" />
      </div>

      {/* Command palette shortcut */}
      <button
        type="button"
        onClick={onOpenCommand}
        className="hidden md:flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-sm
                   border border-border bg-raised/60 text-muted
                   hover:text-foreground hover:border-border-elevated interactive
                   focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Open command palette"
      >
        <Search className="w-3.5 h-3.5" aria-hidden />
        <span className="text-xs">Search</span>
        <kbd className="kbd ml-1">⌘K</kbd>
      </button>

      {/* Page-specific actions */}
      {actions}

      {/* Share */}
      {onShare && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShare}
          disabled={shareDisabled}
          className="h-8 px-2 gap-1.5"
          aria-label="Share this session"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden />
          <span className="hidden sm:inline text-xs">Share</span>
        </Button>
      )}

      <ThemeToggle className="h-8 w-8 p-0 shrink-0" />

      {/* Account / connection menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label="Account and connections"
          >
            {github.connected ? (
              <Github className="w-4 h-4" aria-hidden />
            ) : (
              <User className="w-4 h-4" aria-hidden />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="tag-mono">github</p>
            <p className="text-xs mt-0.5 font-mono truncate">
              {github.connected ? `@${github.user ?? 'connected'}` : 'Not connected'}
            </p>
          </div>
          <DropdownMenuSeparator />
          {github.configured && !github.connected && (
            <DropdownMenuItem onClick={github.connect} className="gap-2 text-xs">
              <Github className="w-3.5 h-3.5" aria-hidden />
              Connect GitHub
            </DropdownMenuItem>
          )}
          {github.connected && (
            <DropdownMenuItem onClick={github.disconnect} className="gap-2 text-xs">
              <LogOut className="w-3.5 h-3.5" aria-hidden />
              Disconnect GitHub
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2 text-xs">
            <User className="w-3.5 h-3.5" aria-hidden />
            Settings
          </DropdownMenuItem>
          {hasData && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleReset} className="gap-2 text-xs">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                Disconnect codebase
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
