/**
 * Shared, lazily-initialised Mermaid instance.
 *
 * Mermaid is a large dependency, so it is dynamically imported the first time
 * anything needs it and the promise is cached. Theme variables are pulled from
 * the live CSS custom properties so diagrams follow light/dark like the rest
 * of the UI.
 */
type MermaidApi = typeof import('mermaid').default;

let cached: Promise<MermaidApi> | null = null;

/** Read a design token off the document root. */
const token = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
};

const buildThemeVariables = () => ({
  background: token('--surface-panel', '#14171C'),
  primaryColor: token('--surface-raised', '#191D23'),
  primaryTextColor: token('--foreground', '#EDEFF2'),
  primaryBorderColor: token('--border', '#262B33'),
  // Edges use cyan — the "connections / system state" accent
  lineColor: token('--cyan', '#6FD6C9'),
  secondaryColor: token('--surface-raised', '#191D23'),
  tertiaryColor: token('--surface-panel', '#14171C'),
  mainBkg: token('--surface-raised', '#191D23'),
  nodeBorder: token('--border', '#262B33'),
  clusterBkg: 'transparent',
  clusterBorder: token('--border', '#262B33'),
  titleColor: token('--foreground', '#EDEFF2'),
  edgeLabelBackground: token('--surface-panel', '#14171C'),
  textColor: token('--foreground', '#EDEFF2'),
  fontFamily: 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
  fontSize: '13px',
});

/**
 * `suppressErrorRendering` is the load-bearing option here. Without it, a
 * failed `render()` makes Mermaid draw its own "Syntax error in text" bomb
 * graphic into a temp node it appended to <body>, and then leaves that node
 * behind. Those orphans stack up outside our chat container — one per failed
 * attempt. With it set, Mermaid calls its internal removeTempElements() and
 * simply rethrows, so our catch block owns the failure UI.
 */
const baseConfig = () => ({
  startOnLoad: false,
  theme: 'base' as const,
  themeVariables: buildThemeVariables(),
  // Strict sanitises HTML in labels — required since diagram text can
  // originate from model output.
  securityLevel: 'strict' as const,
  suppressErrorRendering: true,
  flowchart: {
    curve: 'basis' as const,
    padding: 14,
    nodeSpacing: 38,
    rankSpacing: 56,
    useMaxWidth: true,
  },
});

export const loadMermaid = async (): Promise<MermaidApi> => {
  if (!cached) {
    cached = import('mermaid').then(mod => {
      const mermaid = mod.default;
      mermaid.initialize(baseConfig());
      return mermaid;
    });
  }
  return cached;
};

/**
 * Re-apply theme variables after a light/dark switch so the next render picks
 * up new colours.
 */
export const resetMermaidTheme = async () => {
  if (!cached) return;
  const mermaid = await cached;
  mermaid.initialize(baseConfig());
};

/**
 * Diagram-type keywords Mermaid understands. Used to tell "the model emitted a
 * real diagram" apart from "the model emitted a stray fragment in a mermaid
 * fence" — a lone `classDef` line parses as nothing and would otherwise show
 * up as a scary render failure.
 */
const DIAGRAM_KEYWORDS = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'mindmap',
  'timeline',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'architecture-beta',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Dynamic',
  'C4Deployment',
];

/**
 * True when the source opens with a diagram declaration, i.e. it is plausibly a
 * whole diagram rather than a fragment. Leading comments/directives are skipped.
 */
export const looksLikeDiagram = (src: string): boolean => {
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    // Skip blanks, %% comments and %%{init}%% directives
    if (!line || line.startsWith('%%')) continue;
    return DIAGRAM_KEYWORDS.some(
      kw => line === kw || line.startsWith(`${kw} `) || line.startsWith(`${kw};`)
    );
  }
  return false;
};

/**
 * Strip artefacts that show up in model output: a wrapping ``` fence the
 * markdown parser didn't consume, and `mermaid` repeated as the first line.
 */
export const normalizeDiagramSource = (src: string): string => {
  let out = src.trim();
  out = out.replace(/^```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  out = out.replace(/^mermaid\s*\n/i, '');
  return out.trim();
};
