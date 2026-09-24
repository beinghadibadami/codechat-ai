/**
 * NotFound — 404.
 *
 * Previously used stock Tailwind greys and a blue link, which sat outside the
 * palette entirely. Now uses design tokens and offers both exits (marketing
 * page and workspace) since a bad URL could come from either side.
 */
import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn('404 — no route for', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground px-5">
      <div className="text-center max-w-sm">
        <div
          className="w-10 h-10 mx-auto rounded-md border border-border bg-raised
                     grid place-items-center mb-5"
          aria-hidden
        >
          <FileQuestion className="w-4 h-4 text-muted" />
        </div>

        <p className="tag-mono mb-2">404</p>
        <h1 className="text-xl font-semibold tracking-tight">This page doesn't exist</h1>
        <p className="mt-2 text-[13px] text-muted leading-relaxed">
          No route matches{' '}
          <code className="font-mono text-xs text-foreground break-all">
            {location.pathname}
          </code>
          .
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
              Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/app">Open workspace</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
