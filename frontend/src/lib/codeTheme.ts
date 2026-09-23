/**
 * Syntax highlighting theme for react-syntax-highlighter (Prism).
 *
 * Built from the design tokens rather than importing a stock theme, so code
 * blocks sit inside the same amber/cyan palette as the rest of the product and
 * follow light/dark automatically via CSS variables.
 *
 * Only two accent hues are used: amber for literals/keywords that need weight,
 * cyan for identifiers and links. Everything else is a text tier.
 */
import type { CSSProperties } from 'react';

type PrismTheme = Record<string, CSSProperties>;

const fg = 'hsl(var(--foreground))';
const muted = 'hsl(var(--text-muted))';
const faint = 'hsl(var(--text-faint))';
const amber = 'hsl(var(--amber))';
const cyan = 'hsl(var(--cyan))';

export const codeTheme: PrismTheme = {
  'code[class*="language-"]': {
    color: fg,
    background: 'none',
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    fontSize: '12.5px',
    lineHeight: 1.6,
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: fg,
    background: 'transparent',
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    fontSize: '12.5px',
    lineHeight: 1.6,
    margin: 0,
    padding: '0.75rem',
    overflow: 'auto',
  },

  comment: { color: faint, fontStyle: 'italic' },
  prolog: { color: faint },
  doctype: { color: faint },
  cdata: { color: faint },

  punctuation: { color: muted },
  operator: { color: muted },

  property: { color: cyan },
  tag: { color: cyan },
  'attr-name': { color: cyan },
  'class-name': { color: cyan },
  function: { color: cyan },
  'function-variable': { color: cyan },
  symbol: { color: cyan },
  constant: { color: cyan },
  variable: { color: fg },

  boolean: { color: amber },
  number: { color: amber },
  string: { color: amber },
  char: { color: amber },
  'attr-value': { color: amber },
  regex: { color: amber },

  keyword: { color: amber, fontWeight: 500 },
  atrule: { color: amber },
  'rule': { color: amber },
  important: { color: amber, fontWeight: 600 },

  selector: { color: cyan },
  builtin: { color: cyan },
  inserted: { color: cyan },
  deleted: { color: amber },

  entity: { color: fg, cursor: 'help' },
  url: { color: cyan },
  namespace: { color: muted, opacity: 0.8 },

  bold: { fontWeight: 600 },
  italic: { fontStyle: 'italic' },
};
