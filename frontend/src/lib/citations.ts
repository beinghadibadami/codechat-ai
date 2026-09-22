/**
 * Citation parser
 *
 * Extracts citation tokens like `[file.py:12-34]`, `[main.py:45]`, `[README.md]`
 * from LLM output and turns them into clickable elements. The regex requires
 * a file with a dotted extension so it doesn't collide with markdown links
 * (which react-markdown has already consumed by the time we see text).
 */
import React from 'react';
import type { Citation } from '@/components/FileViewer';

// Match [filename.ext] or [filename.ext:12] or [filename.ext:12-34]
// The filename can contain word chars, dots, dashes, slashes (for paths like [src/main.py:10])
export const CITATION_REGEX =
  /\[((?:[\w./-]+)\.\w{1,6})(?::(\d+)(?:-(\d+))?)?\]/g;

export interface ParsedCitation extends Citation {
  raw: string; // the full matched text, e.g. "[main.py:12-34]"
}

/**
 * Split a plain string into a mix of text segments and citation objects.
 * Returns a flat array where each element is either a string or a Citation.
 */
export const parseCitationString = (input: string): Array<string | ParsedCitation> => {
  const parts: Array<string | ParsedCitation> = [];
  let lastIndex = 0;

  // Reset regex state (regex is global, needs fresh state per call)
  const regex = new RegExp(CITATION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const [raw, file, startStr, endStr] = match;
    if (match.index > lastIndex) {
      parts.push(input.slice(lastIndex, match.index));
    }
    parts.push({
      raw,
      file,
      lineStart: startStr ? parseInt(startStr, 10) : undefined,
      lineEnd: endStr ? parseInt(endStr, 10) : startStr ? parseInt(startStr, 10) : undefined,
    });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < input.length) {
    parts.push(input.slice(lastIndex));
  }
  return parts;
};

/**
 * Walk a React children tree, replacing any strings that contain citation
 * tokens with a mix of strings + <CitationLink>. Preserves all other nodes.
 */
export const renderWithCitations = (
  children: React.ReactNode,
  onCitationClick: (c: Citation) => void,
  onSources?: () => Set<string>
): React.ReactNode => {
  const knownFiles = onSources?.() ?? null;

  const render = (node: React.ReactNode, keyPrefix: string): React.ReactNode => {
    if (typeof node === 'string') {
      const parts = parseCitationString(node);
      if (parts.length === 1 && typeof parts[0] === 'string') {
        return node; // no citations found
      }
      return parts.map((part, i) => {
        if (typeof part === 'string') return part;
        // If we have a list of known source files, verify the citation
        // matches one before rendering it as a link
        const isKnown = !knownFiles || knownFiles.has(part.file) ||
          Array.from(knownFiles).some(f => f.endsWith(part.file));
        if (!isKnown) {
          return React.createElement('span', {
            key: `${keyPrefix}-${i}`,
            className: 'text-muted-foreground',
            title: 'Citation could not be verified in retrieved sources',
          }, part.raw);
        }
        return React.createElement('button', {
          key: `${keyPrefix}-${i}`,
          onClick: () => onCitationClick(part),
          className:
            'inline px-1 py-0 mx-0.5 rounded text-xs font-mono ' +
            'bg-primary/10 text-primary hover:bg-primary/20 ' +
            'transition-colors cursor-pointer align-baseline',
          title: `Open ${part.file}${part.lineStart ? ` at line ${part.lineStart}` : ''}`,
        }, part.raw);
      });
    }

    if (Array.isArray(node)) {
      return node.map((child, i) => render(child, `${keyPrefix}-${i}`));
    }

    // React element — recurse into its children if any
    if (React.isValidElement(node)) {
      const props = node.props as any;
      if (props?.children) {
        return React.cloneElement(
          node,
          undefined,
          render(props.children, `${keyPrefix}-c`)
        );
      }
    }

    return node;
  };

  return render(children, 'cite');
};
