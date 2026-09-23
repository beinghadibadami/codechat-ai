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

export const loadMermaid = async (): Promise<MermaidApi> => {
  if (!cached) {
    cached = import('mermaid').then(mod => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: buildThemeVariables(),
        // Strict sanitises HTML in labels — required since diagram text can
        // originate from model output.
        securityLevel: 'strict',
        flowchart: {
          curve: 'basis',
          padding: 14,
          nodeSpacing: 38,
          rankSpacing: 56,
          useMaxWidth: true,
        },
        // Respect the user's motion preference
        ...(typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? { sequence: { useMaxWidth: true } }
          : {}),
      });
      return mermaid;
    });
  }
  return cached;
};

/**
 * Re-apply theme variables after a light/dark switch and drop the cache so the
 * next render picks up new colours.
 */
export const resetMermaidTheme = async () => {
  if (!cached) return;
  const mermaid = await cached;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: buildThemeVariables(),
    securityLevel: 'strict',
    flowchart: { curve: 'basis', padding: 14, nodeSpacing: 38, rankSpacing: 56, useMaxWidth: true },
  });
};
