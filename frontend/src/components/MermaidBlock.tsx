/**
 * MermaidBlock — renders a ```mermaid fence from an assistant message.
 *
 * Mermaid is ~700 KB so it's lazy-loaded on first use and the module promise
 * is cached module-wide.
 *
 * Two things this component has to be careful about:
 *
 * 1. While a reply is streaming, `chart` arrives one token at a time, so most
 *    intermediate values are syntactically incomplete. Rendering each one is
 *    wasted work and used to leave a trail of Mermaid's own error graphics in
 *    the DOM. We hold off until the stream settles.
 * 2. Models sometimes put a fragment in a mermaid fence (a lone `classDef`
 *    line, say). That isn't a diagram and shouldn't be reported as a failure —
 *    it's just code, so we show it as code.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { loadMermaid, looksLikeDiagram, normalizeDiagramSource } from '@/lib/mermaid';

interface Props {
  chart: string;
  /** True while the containing message is still being streamed in. */
  streaming?: boolean;
}

type State =
  | { kind: 'idle' }
  | { kind: 'rendered'; svg: string }
  | { kind: 'failed' }
  | { kind: 'not-a-diagram' };

/** Debounce for re-renders, so a settling stream renders once, not N times. */
const RENDER_DEBOUNCE_MS = 120;

export const MermaidBlock: React.FC<Props> = ({ chart, streaming = false }) => {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const source = normalizeDiagramSource(chart);

  useEffect(() => {
    // Wait for the stream to finish before attempting anything — a partial
    // diagram is expected to be invalid and isn't worth reporting.
    if (streaming) {
      setState({ kind: 'idle' });
      return;
    }

    if (!source) {
      setState({ kind: 'not-a-diagram' });
      return;
    }

    // A fence with no diagram declaration is a fragment, not a broken diagram.
    if (!looksLikeDiagram(source)) {
      setState({ kind: 'not-a-diagram' });
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const mermaid = await loadMermaid();

          // Validate first. `parse` with suppressErrors returns false instead
          // of throwing, and unlike `render` it never touches the DOM.
          const ok = await mermaid.parse(source, { suppressErrors: true });
          if (cancelled) return;
          if (!ok) {
            setState({ kind: 'failed' });
            return;
          }

          const id = `md-mermaid-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, source);
          if (!cancelled) setState({ kind: 'rendered', svg });
        } catch {
          if (!cancelled) setState({ kind: 'failed' });
        }
      })();
    }, RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, streaming]);

  // Not a diagram — show the source as plain code, no alarm.
  if (state.kind === 'not-a-diagram') {
    if (!source) return null;
    return (
      <div className="my-3.5 rounded-md border border-border overflow-hidden">
        <div className="flex items-center h-7 px-2.5 border-b border-border bg-raised/60">
          <span className="tag-mono">mermaid</span>
        </div>
        <pre className="text-code p-3 overflow-x-auto text-muted">{source}</pre>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className="my-3.5 rounded-md border border-border overflow-hidden">
        <div className="flex items-center gap-1.5 h-7 px-2.5 border-b border-border bg-raised/60">
          <AlertTriangle className="w-3 h-3 text-primary" aria-hidden />
          <span className="tag-mono">diagram source</span>
        </div>
        <pre className="text-code p-3 overflow-x-auto text-muted">{source}</pre>
      </div>
    );
  }

  if (state.kind === 'idle') {
    return (
      <div
        className="my-3.5 h-24 rounded-md border border-border grid place-items-center text-faint"
        role="status"
      >
        <span className="flex items-center gap-1.5 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          {streaming ? 'Building diagram' : 'Rendering diagram'}
        </span>
      </div>
    );
  }

  return (
    <figure className="my-3.5 rounded-md border border-border bg-panel/40 p-3 overflow-x-auto">
      <div
        className="[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto"
        // Mermaid is configured with securityLevel:'strict', which sanitises
        // label content before it reaches this string.
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </figure>
  );
};
