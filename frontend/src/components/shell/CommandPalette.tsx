/**
 * CommandPalette — ⌘K launcher.
 *
 * Two jobs: jump between workspace areas, and jump to a file in the indexed
 * codebase. File search runs against the already-loaded file tree, so it's
 * instant and needs no extra endpoint.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  MessageSquare,
  GitPullRequest,
  Share2,
  Settings,
  Boxes,
  FileCode,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import type { FileTreeNode } from '@/services/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Flatten the tree into a searchable list of file paths. */
const flattenFiles = (nodes: FileTreeNode[], acc: FileTreeNode[] = []): FileTreeNode[] => {
  for (const node of nodes) {
    if (node.type === 'file') acc.push(node);
    else if (node.children) flattenFiles(node.children, acc);
  }
  return acc;
};

export const CommandPalette: React.FC<Props> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { fileTree, hasData, sessionInfo } = useSession();
  const isGithub = sessionInfo?.source_type === 'github';

  const files = useMemo(() => flattenFiles(fileTree).slice(0, 400), [fileTree]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const openFile = (path: string) => {
    onOpenChange(false);
    // Chat reads ?file= and opens that path in the source panel. There's no
    // standalone file route any more — reading code always happens next to a
    // conversation.
    navigate(`/chat?file=${encodeURIComponent(path)}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a view or search files..." />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go('/app')} className="gap-2 text-xs">
            <Boxes className="w-3.5 h-3.5" aria-hidden /> Workspace
          </CommandItem>
          {hasData && (
            <>
              <CommandItem onSelect={() => go('/chat')} className="gap-2 text-xs">
                <MessageSquare className="w-3.5 h-3.5" aria-hidden /> Chat
              </CommandItem>
              {isGithub && (
                <CommandItem onSelect={() => go('/pulls')} className="gap-2 text-xs">
                  <GitPullRequest className="w-3.5 h-3.5" aria-hidden /> Pull requests
                </CommandItem>
              )}
            </>
          )}
          <CommandItem onSelect={() => go('/shared')} className="gap-2 text-xs">
            <Share2 className="w-3.5 h-3.5" aria-hidden /> Shared sessions
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')} className="gap-2 text-xs">
            <Settings className="w-3.5 h-3.5" aria-hidden /> Settings
          </CommandItem>
        </CommandGroup>

        {files.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Files (${files.length})`}>
              {files.map(f => (
                <CommandItem
                  key={f.path}
                  value={f.path}
                  onSelect={() => openFile(f.path)}
                  className="gap-2"
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-faint" aria-hidden />
                  <span className="font-mono text-xs truncate">{f.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
