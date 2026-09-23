/**
 * MermaidBlock — renders a ```mermaid fence from an assistant message.
 *
 * Mermaid is ~700 KB so it's lazy-loaded on first use and the module promise
 * is cached module-wide. Render failures fall back to showing the raw source
 * rather than swallowing the block.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { loadMermaid } from '@/lib/mermaid';

interface Props {
  chart: string;
}

export const MermaidBlock: React.FC<Props> = ({ chart }) => {
  const [svg, setSvg] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSvg('');

    (async () => {
      try {
        const mermaid = await loadMermaid();
        const id = `md-mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    return (
      <div className="my-3.5 rounded-md border border-border overflow-hidden">
        <div className="flex items-center gap-1.5 h-7 px-2.5 border-b border-border bg-raised/60">
          <AlertTriangle className="w-3 h-3 text-primary" aria-hidden />
          <span className="tag-mono">diagram source</span>
        </div>
        <pre className="text-code p-3 overflow-x-auto text-muted">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className="my-3.5 h-24 rounded-md border border-border grid place-items-center text-faint"
        role="status"
      >
        <span className="flex items-center gap-1.5 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          Rendering diagram
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
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  );
};
