/**
 * Sidebar — persistent workspace navigation.
 *
 * Text labels with small monospace category tags rather than an icon-only
 * rail, so the destination is never ambiguous. Collapses to an icon rail on
 * narrow desktop widths and is rendered inside a drawer on mobile
 * (see MobileNav).
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  GitPullRequest,
  Share2,
  Settings,
  Boxes,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { SourceBadge } from './SourceBadge';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  tag: string;
  icon: React.ElementType;
  /** Disabled until a codebase is indexed */
  needsData?: boolean;
  /** Disabled unless the source is a GitHub repo */
  needsRepo?: boolean;
}

/**
 * Chat is the product; everything else supports it. Files and Architecture
 * used to be routes here — files now open from citations, and diagrams render
 * inside answers, so neither needs a destination of its own.
 */
const NAV: NavItem[] = [
  { to: '/app', label: 'Workspace', tag: 'src', icon: Boxes },
  { to: '/chat', label: 'Chat', tag: 'ask', icon: MessageSquare, needsData: true },
  { to: '/pulls', label: 'Pull requests', tag: 'diff', icon: GitPullRequest, needsData: true, needsRepo: true },
  { to: '/shared', label: 'Shared', tag: 'link', icon: Share2 },
  { to: '/settings', label: 'Settings', tag: 'cfg', icon: Settings },
];

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Called after navigation — lets the mobile drawer close itself */
  onNavigate?: () => void;
}

export const Sidebar: React.FC<Props> = ({ collapsed, onToggleCollapsed, onNavigate }) => {
  const { sessionInfo, hasData } = useSession();
  const location = useLocation();
  const isGithub = sessionInfo?.source_type === 'github';

  const isDisabled = (item: NavItem) =>
    (item.needsData && !hasData) || (item.needsRepo && !isGithub);

  return (
    <nav
      aria-label="Workspace navigation"
      className={cn(
        'flex flex-col h-full bg-panel border-r border-border',
        collapsed ? 'w-14' : 'w-sidebar'
      )}
    >
      {/* Brand — links out to the marketing page */}
      <NavLink
        to="/"
        className="group h-topbar flex items-center gap-2 px-3 border-b border-border
                   shrink-0 hover:bg-raised/40 interactive focus-ring"
        title="Back to home"
      >
        <div
          className="relative w-6 h-6 border border-primary/40 bg-primary/10
                     grid place-items-center shrink-0"
          aria-hidden
        >
          <span className="font-mono text-[11px] font-bold text-primary group-hover:opacity-0 transition-opacity">
            &gt;_
          </span>
          <ArrowLeft
            className="w-3 h-3 text-primary absolute opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
        {!collapsed && (
          <span className="font-display font-bold text-sm tracking-tight truncate">gitchat</span>
        )}
      </NavLink>

      {/* Active source */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-border">
          <SourceBadge />
        </div>
      )}

      {/* Nav items */}
      <ul className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map(item => {
          const disabled = isDisabled(item);
          const Icon = item.icon;
          const active = location.pathname === item.to;

          if (disabled) {
            return (
              <li key={item.to}>
                <span
                  aria-disabled="true"
                  title={
                    item.needsRepo && !isGithub && hasData
                      ? 'Needs a GitHub repository'
                      : 'Connect a codebase first'
                  }
                  className="flex items-center gap-2.5 px-2 h-9 rounded-sm
                             text-faint cursor-not-allowed select-none"
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                  {!collapsed && (
                    <>
                      <span className="text-[13px] truncate">{item.label}</span>
                      <span className="tag-mono ml-auto">{item.tag}</span>
                    </>
                  )}
                </span>
              </li>
            );
          }

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-2 h-9 rounded-sm interactive',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    isActive
                      ? 'bg-raised text-foreground shadow-[inset_2px_0_0_hsl(var(--amber))]'
                      : 'text-muted hover:bg-raised/60 hover:text-foreground'
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                {!collapsed && (
                  <>
                    <span className="text-[13px] truncate">{item.label}</span>
                    <span
                      className={cn(
                        'tag-mono ml-auto',
                        active && 'text-primary/70'
                      )}
                    >
                      {item.tag}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      {/* Collapse toggle — desktop only; the mobile drawer has its own close */}
      <div className="border-t border-border p-2 hidden lg:block">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-2.5 w-full px-2 h-8 rounded-sm
                     text-faint hover:text-foreground hover:bg-raised/60 interactive
                     focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0" aria-hidden />
          ) : (
            <PanelLeftClose className="w-4 h-4 shrink-0" aria-hidden />
          )}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </nav>
  );
};
