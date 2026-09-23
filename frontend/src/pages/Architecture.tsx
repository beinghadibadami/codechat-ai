/**
 * Architecture — dependency graph of the indexed codebase.
 *
 * The backend parses imports and emits Mermaid; we render it and make nodes
 * clickable so a box in the diagram leads to the file it represents. Diagrams
 * can get wide, so the canvas scrolls in both directions rather than shrinking
 * nodes into illegibility.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Network, Loader2, Download, RefreshCw, Info } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CodePreview, PreviewTarget } from '@/components/workspace/CodePreview';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { useSession } from '@/contexts/SessionContext';
import { apiService } from '@/services/api';
import { loadMermaid } from '@/lib/mermaid';
import { useToast } from '@/hooks/use-toast';

interface GraphNode {
  id: string;
  label: string;
  path: string;
  language: string;
  in_degree: number;
  out_degree: number;
}

interface GraphStats {
  files_scanned: number;
  internal_edges: number;
  kept_nodes: number;
  kept_edges: number;
  external_deps: Array<{ name: string; count: number }>;
}

const NODE_LIMITS = [30, 50, 100, 200];

const Architecture: React.FC = () => {
  const { hasData, isLoading, repoUrl } = useSession();
  const { toast } = useToast();

  const [maxNodes, setMaxNodes] = useState(50);
  const [mermaidSrc, setMermaidSrc] = useState('');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [svg, setSvg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null);

  /** id → path, for translating a diagram click into a file. */
  const nodeIndex = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Fetch the graph
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await apiService.getArchitecture(maxNodes);
        if (cancelled) return;
        setMermaidSrc(data.mermaid);
        setNodes(data.nodes as GraphNode[]);
        setStats(data.stats as GraphStats);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not build the graph');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasData, maxNodes, reloadKey]);

  // Render Mermaid → SVG
  useEffect(() => {
    if (!mermaidSrc) {
      setSvg('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(`arch-${Date.now()}`, mermaidSrc);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) {
          setError(`Diagram could not be rendered: ${(e as Error).message}`);
          setSvg('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mermaidSrc]);

  /**
   * Delegate clicks on the rendered SVG. Mermaid emits node groups with ids
   * that contain our safe id, so we walk up from the click target to find it.
   */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      let el = e.target as HTMLElement | null;
      for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
        const raw = el.id || '';
        for (const [id, node] of nodeIndex) {
          if (raw.includes(id)) {
            setTarget({ path: node.path });
            return;
          }
        }
      }
    },
    [nodeIndex]
  );

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Diagram saved' });
  };

  if (!isLoading && !hasData) return <Navigate to="/" replace />;

  const hasGraph = Boolean(svg) && (stats?.kept_nodes ?? 0) > 0;

  const actions = (
    <>
      <label htmlFor="node-limit" className="sr-only">
        Maximum nodes
      </label>
      <select
        id="node-limit"
        value={maxNodes}
        onChange={e => setMaxNodes(Number(e.target.value))}
        disabled={loading}
        className="hidden sm:block h-8 px-2 rounded-sm border border-border bg-raised/60
                   text-xs font-mono focus-visible:ring-2 focus-visible:ring-ring
                   focus-visible:outline-none"
      >
        {NODE_LIMITS.map(n => (
          <option key={n} value={n}>
            {n} nodes
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setReloadKey(k => k + 1)}
        disabled={loading}
        className="h-8 w-8 p-0"
        aria-label="Rebuild graph"
        title="Rebuild graph"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={downloadSvg}
        disabled={!svg}
        className="h-8 w-8 p-0"
        aria-label="Download SVG"
        title="Download SVG"
      >
        <Download className="w-4 h-4" aria-hidden />
      </Button>
    </>
  );

  return (
    <AppShell scroll={false} actions={actions}>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-4 sm:px-5 h-9 border-b border-border bg-panel/40">
          <Network className="w-3.5 h-3.5 text-faint shrink-0" aria-hidden />
          <h1 className="text-xs font-medium">Architecture</h1>
          {stats && (
            <span className="tag-mono ml-auto hidden sm:inline">
              {stats.kept_nodes} files · {stats.kept_edges} imports · scanned{' '}
              {stats.files_scanned}
            </span>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0 overflow-auto grid-backdrop">
          {loading && (
            <div className="h-full grid place-items-center" role="status">
              <span className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                Parsing imports and building the graph
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="h-full grid place-items-center">
              <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
            </div>
          )}

          {!loading && !error && !hasGraph && (
            <div className="h-full grid place-items-center">
              <EmptyState
                icon={Network}
                title="No internal dependencies found"
                description="We parsed the imports but nothing in this codebase imports anything else in it. That's normal for flat scripts, single-file projects, or repos that are mostly docs and config."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setReloadKey(k => k + 1)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                    Try again
                  </Button>
                }
                hints={['supports python', 'javascript', 'typescript']}
              />
            </div>
          )}

          {!loading && !error && hasGraph && (
            <div className="p-4 sm:p-6 min-w-fit">
              <div
                ref={canvasRef}
                onClick={onCanvasClick}
                className="[&_svg]:max-w-none [&_svg]:h-auto
                           [&_.node]:cursor-pointer [&_.node:hover_rect]:stroke-primary
                           [&_.node:hover_polygon]:stroke-primary"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          )}
        </div>

        {/* Legend + externals */}
        {hasGraph && (
          <div className="shrink-0 border-t border-border bg-panel/40 px-4 sm:px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {/* Legend — shape + text, not colour alone */}
              <ul className="flex items-center gap-4" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span className="w-4 h-0 border-t-2 border-cyan" aria-hidden />
                  <span className="text-2xs text-muted">imports</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm border border-border bg-raised"
                    aria-hidden
                  />
                  <span className="text-2xs text-muted">file</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-faint" aria-hidden />
                  <span className="text-2xs text-muted">click a node to read it</span>
                </li>
              </ul>

              {stats?.external_deps?.length ? (
                <div className="flex items-center gap-1.5 min-w-0 ml-auto">
                  <span className="tag-mono shrink-0">external</span>
                  <ul className="flex gap-1 overflow-x-auto no-scrollbar">
                    {stats.external_deps.slice(0, 8).map(d => (
                      <li
                        key={d.name}
                        className="font-mono text-2xs px-1.5 py-0.5 rounded-sm border
                                   border-border bg-raised/60 text-faint whitespace-nowrap"
                        title={`imported ${d.count} time${d.count === 1 ? '' : 's'}`}
                      >
                        {d.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Node → source */}
      <Sheet open={Boolean(target)} onOpenChange={open => !open && setTarget(null)}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-2xl border-border">
          <CodePreview target={target} repoUrl={repoUrl} />
        </SheetContent>
      </Sheet>
    </AppShell>
  );
};

export default Architecture;
