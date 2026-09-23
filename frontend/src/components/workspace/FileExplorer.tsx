/**
 * FileExplorer — tree view of the indexed codebase.
 *
 * Folders collapse, files select, and a filter narrows by path substring.
 * When filtering, matching files are shown flat so the user isn't forced to
 * expand folders to find a hit.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  Search,
  X,
  Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/states/EmptyState';
import type { FileTreeNode } from '@/services/api';
import { cn } from '@/lib/utils';

/** Extension → short monospace tag shown on the right of each file row. */
const extTag = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    py: 'py', go: 'go', rs: 'rs', java: 'java', rb: 'rb',
    php: 'php', cs: 'cs', cpp: 'cpp', c: 'c', kt: 'kt', swift: 'swift',
    json: 'json', yaml: 'yml', yml: 'yml', xml: 'xml',
    md: 'md', txt: 'txt', rst: 'rst',
    html: 'html', css: 'css', sql: 'sql', csv: 'csv', ipynb: 'ipynb',
  };
  return map[ext] ?? ext.slice(0, 5);
};

const flatten = (nodes: FileTreeNode[], acc: FileTreeNode[] = []): FileTreeNode[] => {
  for (const n of nodes) {
    if (n.type === 'file') acc.push(n);
    else if (n.children) flatten(n.children, acc);
  }
  return acc;
};

interface Props {
  tree: FileTreeNode[];
  loading?: boolean;
  selectedPath?: string | null;
  onSelect: (path: string) => void;
  /** "Explain this file" — hits the /explain-file endpoint via the caller */
  onExplain?: (path: string) => void;
  className?: string;
}

export const FileExplorer: React.FC<Props> = ({
  tree,
  loading = false,
  selectedPath,
  onSelect,
  onExplain,
  className,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');

  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const allFiles = useMemo(() => flatten(tree), [tree]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return null;
    return allFiles.filter(f => f.path.toLowerCase().includes(q)).slice(0, 200);
  }, [filter, allFiles]);

  // ---- Loading ----------------------------------------------------------
  if (loading) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="panel-header shrink-0">
          <span className="tag-mono">files</span>
        </div>
        <div className="p-2.5 space-y-2" aria-label="Loading files">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 10}px` }}>
              <Skeleton className="w-3.5 h-3.5 rounded-sm shrink-0" />
              <Skeleton className="h-3 flex-1 max-w-[9rem]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Empty ------------------------------------------------------------
  if (!tree.length) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="panel-header shrink-0">
          <span className="tag-mono">files</span>
        </div>
        <EmptyState
          icon={Folder}
          title="No files yet"
          description="Once a codebase finishes indexing its files appear here."
          className="py-10"
        />
      </div>
    );
  }

  const FileRow: React.FC<{ node: FileTreeNode; depth: number }> = ({ node, depth }) => {
    const active = selectedPath === node.path;
    return (
      <li>
        <div
          className={cn(
            'group/file flex items-center gap-1.5 h-7 pr-1.5 rounded-sm interactive',
            active ? 'bg-raised text-foreground' : 'text-muted hover:bg-raised/50 hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <button
            type="button"
            onClick={() => onSelect(node.path)}
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left h-full rounded-sm
                       focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-current={active ? 'true' : undefined}
            title={node.path}
          >
            <FileCode
              className={cn('w-3.5 h-3.5 shrink-0', active ? 'text-primary' : 'text-faint')}
              aria-hidden
            />
            <span className="font-mono text-xs truncate">{node.name}</span>
          </button>

          {/* Extension tag gives way to the explain action on hover */}
          {onExplain ? (
            <>
              <span
                className="tag-mono shrink-0 group-hover/file:hidden group-focus-within/file:hidden"
                aria-hidden
              >
                {extTag(node.name)}
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onExplain(node.path);
                }}
                className="hidden group-hover/file:grid group-focus-within/file:grid
                           place-items-center w-4 h-4 shrink-0 rounded-sm
                           text-faint hover:text-primary
                           focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Explain ${node.name}`}
                title="Explain this file"
              >
                <Sparkles className="w-3 h-3" aria-hidden />
              </button>
            </>
          ) : (
            <span className="tag-mono shrink-0" aria-hidden>
              {extTag(node.name)}
            </span>
          )}
        </div>
      </li>
    );
  };

  const renderNodes = (nodes: FileTreeNode[], depth = 0): React.ReactNode => (
    <ul role="group" className="space-y-px">
      {nodes.map(node => {
        if (node.type === 'file') {
          return <FileRow key={node.path} node={node} depth={depth} />;
        }

        const isOpen = expanded.has(node.path);
        const childCount = node.children?.length ?? 0;

        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => toggle(node.path)}
              aria-expanded={isOpen}
              className="flex items-center gap-1.5 w-full h-7 pr-1.5 rounded-sm text-left
                         text-muted hover:bg-raised/50 hover:text-foreground interactive
                         focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              title={node.path}
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 shrink-0 text-faint" aria-hidden />
              ) : (
                <ChevronRight className="w-3 h-3 shrink-0 text-faint" aria-hidden />
              )}
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-faint" aria-hidden />
              ) : (
                <Folder className="w-3.5 h-3.5 shrink-0 text-faint" aria-hidden />
              )}
              <span className="text-xs truncate flex-1">{node.name}</span>
              <span className="tag-mono shrink-0">{childCount}</span>
            </button>
            {isOpen && node.children && renderNodes(node.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <div className="panel-header shrink-0">
        <span className="tag-mono">files · {allFiles.length}</span>
      </div>

      {/* Filter */}
      <div className="p-2 border-b border-border shrink-0">
        <div className="relative">
          <Search
            className="w-3 h-3 text-faint absolute left-2 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by path…"
            aria-label="Filter files by path"
            className="h-7 pl-7 pr-7 text-xs font-mono bg-raised/50 border-border"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint
                         hover:text-foreground rounded-sm focus-visible:ring-2
                         focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Clear filter"
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Tree / results */}
      <div className="flex-1 overflow-y-auto p-1.5 min-h-0">
        {filtered ? (
          filtered.length ? (
            <ul className="space-y-px">
              {filtered.map(f => (
                <FileRow key={f.path} node={f} depth={0} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint px-2 py-4 text-center">
              No files match <span className="font-mono">{filter}</span>
            </p>
          )
        ) : (
          renderNodes(tree)
        )}
      </div>
    </div>
  );
};
