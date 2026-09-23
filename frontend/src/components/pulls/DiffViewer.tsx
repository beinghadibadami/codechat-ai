/**
 * DiffViewer — renders a unified diff patch from the GitHub API.
 *
 * Colour language is deliberately amber (removed) / cyan (added) rather than
 * red/green: it keeps the product to two accent hues and avoids the
 * red-means-broken reading, since a removal in a diff isn't an error. A
 * leading +/- glyph carries the same information for anyone who can't
 * distinguish the tints.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus2, FileMinus2, FileDiff, MessageSquare } from 'lucide-react';
import type { PullFile, PullComment } from '@/services/api';
import { cn } from '@/lib/utils';

type LineKind = 'add' | 'remove' | 'context' | 'hunk';

interface DiffLine {
  kind: LineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

/** Parse a unified diff body into typed lines with both line numbers. */
const parsePatch = (patch: string): DiffLine[] => {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      // @@ -12,7 +12,9 @@
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      out.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null });
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({ kind: 'add', text: raw.slice(1), oldNo: null, newNo: newNo++ });
      continue;
    }
    if (raw.startsWith('-')) {
      out.push({ kind: 'remove', text: raw.slice(1), oldNo: oldNo++, newNo: null });
      continue;
    }
    // Context (leading space) or the "\ No newline" marker
    out.push({ kind: 'context', text: raw.replace(/^ /, ''), oldNo: oldNo++, newNo: newNo++ });
  }
  return out;
};

const STATUS_META: Record<PullFile['status'], { Icon: React.ElementType; label: string }> = {
  added: { Icon: FilePlus2, label: 'added' },
  removed: { Icon: FileMinus2, label: 'removed' },
  modified: { Icon: FileDiff, label: 'modified' },
  renamed: { Icon: FileDiff, label: 'renamed' },
};

interface Props {
  files: PullFile[];
  comments?: PullComment[];
  /** Jump to this file/line in the code preview */
  onOpenLine?: (path: string, line: number) => void;
}

export const DiffViewer: React.FC<Props> = ({ files, comments = [], onOpenLine }) => {
  // Start with the first few files open; large PRs stay collapsed
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(files.slice(0, 3).map(f => f.filename))
  );

  const commentsByFile = useMemo(() => {
    const m = new Map<string, PullComment[]>();
    for (const c of comments) {
      if (!c.path) continue;
      const list = m.get(c.path) ?? [];
      list.push(c);
      m.set(c.path, list);
    }
    return m;
  }, [comments]);

  const toggle = (name: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (!files.length) {
    return <p className="text-xs text-faint px-4 py-6 text-center">This pull request has no file changes.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {files.map(file => {
        const isOpen = open.has(file.filename);
        const { Icon, label } = STATUS_META[file.status] ?? STATUS_META.modified;
        const lines = isOpen && file.patch ? parsePatch(file.patch) : [];
        const fileComments = commentsByFile.get(file.filename) ?? [];

        return (
          <li key={file.filename}>
            {/* File header */}
            <button
              type="button"
              onClick={() => toggle(file.filename)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-3 py-2 text-left
                         hover:bg-raised/40 interactive
                         focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 text-faint shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="w-3 h-3 text-faint shrink-0" aria-hidden />
              )}
              <Icon className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
              <span className="font-mono text-xs truncate flex-1" title={file.filename}>
                {file.filename}
              </span>

              {fileComments.length > 0 && (
                <span className="flex items-center gap-1 shrink-0" title={`${fileComments.length} comments`}>
                  <MessageSquare className="w-3 h-3 text-faint" aria-hidden />
                  <span className="font-mono text-2xs text-faint">{fileComments.length}</span>
                </span>
              )}

              <span className="tag-mono shrink-0 hidden sm:inline">{label}</span>
              <span className="font-mono text-2xs shrink-0 tabular-nums">
                <span className="text-cyan">+{file.additions}</span>
                <span className="text-faint mx-0.5">/</span>
                <span className="text-amber">-{file.deletions}</span>
              </span>
            </button>

            {/* Patch body */}
            {isOpen && (
              <div className="border-t border-border bg-raised/20">
                {file.patch_omitted ? (
                  <p className="px-3 py-3 text-xs text-faint">
                    Patch omitted — this file is too large to display inline.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <tbody>
                        {lines.map((line, i) => {
                          if (line.kind === 'hunk') {
                            return (
                              <tr key={i} className="bg-panel/60">
                                <td colSpan={3} className="px-3 py-1">
                                  <span className="font-mono text-2xs text-faint">{line.text}</span>
                                </td>
                              </tr>
                            );
                          }

                          const isAdd = line.kind === 'add';
                          const isRemove = line.kind === 'remove';
                          const jumpLine = line.newNo ?? line.oldNo;

                          return (
                            <tr
                              key={i}
                              className={cn(
                                'group/line align-top',
                                isAdd && 'diff-add',
                                isRemove && 'diff-remove'
                              )}
                            >
                              {/* Old line number */}
                              <td className="select-none w-10 pr-1 text-right">
                                <span className="font-mono text-2xs text-faint tabular-nums">
                                  {line.oldNo ?? ''}
                                </span>
                              </td>
                              {/* New line number — clickable to open the file */}
                              <td className="select-none w-10 pr-2 text-right">
                                {onOpenLine && jumpLine ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenLine(file.filename, jumpLine)}
                                    className="font-mono text-2xs text-faint tabular-nums
                                               hover:text-primary rounded-sm
                                               focus-visible:ring-2 focus-visible:ring-ring
                                               focus-visible:outline-none"
                                    title={`Open ${file.filename}:${jumpLine}`}
                                  >
                                    {line.newNo ?? ''}
                                  </button>
                                ) : (
                                  <span className="font-mono text-2xs text-faint tabular-nums">
                                    {line.newNo ?? ''}
                                  </span>
                                )}
                              </td>
                              {/* Content, prefixed with an explicit glyph */}
                              <td className="pr-3">
                                <span className="diff-line">
                                  <span
                                    className={cn(
                                      'select-none inline-block w-3',
                                      isAdd && 'text-cyan',
                                      isRemove && 'text-amber',
                                      !isAdd && !isRemove && 'text-faint'
                                    )}
                                    aria-hidden
                                  >
                                    {isAdd ? '+' : isRemove ? '-' : ' '}
                                  </span>
                                  <span className={cn(!isAdd && !isRemove && 'text-muted')}>
                                    {line.text || ' '}
                                  </span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Review comments on this file */}
                {fileComments.length > 0 && (
                  <ul className="border-t border-border divide-y divide-border/60">
                    {fileComments.map((c, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MessageSquare className="w-3 h-3 text-cyan shrink-0" aria-hidden />
                          <span className="font-mono text-2xs text-foreground">
                            {c.author ?? 'unknown'}
                          </span>
                          {c.line && (
                            <span className="font-mono text-2xs text-faint">line {c.line}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
                          {c.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
