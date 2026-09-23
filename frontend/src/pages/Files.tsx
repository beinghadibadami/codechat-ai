/**
 * Files — browse the indexed codebase.
 *
 * Two panes on desktop (tree | source), stacked on mobile where selecting a
 * file swaps the view. Accepts `?path=` so command-palette results and shared
 * links deep-link straight to a file.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
import { FileExplorer } from '@/components/workspace/FileExplorer';
import { CodePreview, PreviewTarget } from '@/components/workspace/CodePreview';
import { useSession } from '@/contexts/SessionContext';

const Files: React.FC = () => {
  const { hasData, isLoading, fileTree, repoUrl } = useSession();
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<PreviewTarget | null>(null);

  // Adopt ?path= on mount and whenever it changes
  const pathParam = params.get('path');
  useEffect(() => {
    if (pathParam) setTarget({ path: pathParam });
  }, [pathParam]);

  const select = (path: string) => {
    setTarget({ path });
    // Keep the URL in sync so the view is linkable
    const next = new URLSearchParams(params);
    next.set('path', path);
    setParams(next, { replace: true });
  };

  if (!isLoading && !hasData) return <Navigate to="/" replace />;

  return (
    <AppShell scroll={false}>
      {/* Desktop */}
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={26} minSize={16} maxSize={42} className="bg-panel">
            <FileExplorer
              tree={fileTree}
              loading={isLoading}
              selectedPath={target?.path ?? null}
              onSelect={select}
            />
          </ResizablePanel>
          <ResizableHandle className="bg-border hover:bg-border-elevated transition-colors" />
          <ResizablePanel defaultSize={74} minSize={40}>
            <CodePreview target={target} repoUrl={repoUrl} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile — tree, then preview with a back affordance */}
      <div className="md:hidden h-full">
        {target ? (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-2 py-1.5 border-b border-border bg-panel/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTarget(null)}
                className="h-7 text-xs gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
                All files
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <CodePreview target={target} repoUrl={repoUrl} />
            </div>
          </div>
        ) : (
          <FileExplorer
            tree={fileTree}
            loading={isLoading}
            selectedPath={null}
            onSelect={select}
          />
        )}
      </div>
    </AppShell>
  );
};

export default Files;
