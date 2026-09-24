/**
 * LandingNav — marketing-page header.
 *
 * Separate from the workspace TopBar: no repo state, no indexing status, just
 * navigation and the entry point into the app. Gains a hairline + backdrop
 * once the user scrolls so it separates from the hero without a permanent
 * border.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSession } from '@/contexts/SessionContext';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#languages', label: 'Languages' },
];

export const LandingNav: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const { hasData, repoName } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-14 transition-colors duration-200',
        scrolled && 'border-b border-border bg-background/85 backdrop-blur-md'
      )}
    >
      <nav
        className="max-w-6xl mx-auto h-full px-5 sm:px-6 flex items-center gap-3"
        aria-label="Main"
      >
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 shrink-0 rounded-sm focus-ring">
          <span
            className="w-6 h-6 rounded-sm bg-primary/15 border border-primary/30 grid place-items-center"
            aria-hidden
          >
            <span className="font-mono text-[11px] font-semibold text-primary">C</span>
          </span>
          <span className="font-semibold text-sm tracking-tight">CodeChat</span>
        </Link>

        {/* Section links */}
        <ul className="hidden md:flex items-center gap-1 ml-4">
          {LINKS.map(l => (
            <li key={l.href}>
              <a
                href={l.href}
                className="px-2.5 h-8 inline-flex items-center rounded-sm text-[13px]
                           text-muted hover:text-foreground hover:bg-raised/60
                           interactive focus-ring"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex-1" />

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:grid place-items-center w-8 h-8 rounded-sm text-muted
                     hover:text-foreground hover:bg-raised/60 interactive focus-ring"
          aria-label="GitHub"
        >
          <Github className="w-4 h-4" aria-hidden />
        </a>

        <ThemeToggle className="h-8 w-8 p-0 shrink-0" />

        {/* Resume an existing session, or start a new one */}
        <Button asChild size="sm" className="h-8 text-xs gap-1.5 shrink-0">
          <Link to="/app">
            {hasData && repoName ? 'Resume session' : 'Open app'}
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </Button>
      </nav>
    </header>
  );
};
