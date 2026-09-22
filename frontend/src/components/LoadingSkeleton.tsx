/**
 * LoadingSkeleton
 *
 * Skeleton placeholders shown while chat responses stream or data loads.
 * Uses Tailwind's animate-pulse and semantic muted colors.
 */
import React from 'react';

export const MessageSkeleton: React.FC = () => (
  <div className="flex justify-start animate-fade-in-up" aria-label="Loading response">
    <div className="message-bubble assistant max-w-[80%] space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
        </div>
        <span className="text-sm text-muted-foreground">Analyzing your code...</span>
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    </div>
  </div>
);

export const FileTreeSkeleton: React.FC = () => (
  <div className="p-4 space-y-2 animate-pulse" aria-label="Loading file tree">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 12}px` }}>
        <div className="w-4 h-4 bg-muted rounded" />
        <div className="h-3 bg-muted rounded flex-1 max-w-[200px]" />
      </div>
    ))}
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div className="rounded-lg border border-border p-6 space-y-4 animate-pulse" aria-label="Loading">
    <div className="h-6 bg-muted rounded w-1/3" />
    <div className="space-y-2">
      <div className="h-3 bg-muted rounded" />
      <div className="h-3 bg-muted rounded w-5/6" />
    </div>
    <div className="h-10 bg-muted rounded" />
  </div>
);
