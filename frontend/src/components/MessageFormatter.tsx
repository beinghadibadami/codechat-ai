/**
 * MessageFormatter — renders an assistant message.
 *
 * Handles markdown, fenced code with copy, Mermaid blocks, and inline
 * [file:line] citations that resolve against the retrieved sources for that
 * message. Citations we can't match to a source render as muted text rather
 * than a dead link.
 */
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Copy, Check } from 'lucide-react';
import { renderWithCitations } from '@/lib/citations';
import { MermaidBlock } from '@/components/MermaidBlock';
import { codeTheme } from '@/lib/codeTheme';
import type { Citation } from '@/components/FileViewer';
import type { ChatSource } from '@/services/api';

interface Props {
  content: string;
  /** Retrieved chunks for this message — used to validate citations */
  sources?: ChatSource[];
  onCitationClick?: (citation: Citation) => void;
}

const CodeCopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — nothing useful to show */
        }
      }}
      className="absolute top-1.5 right-1.5 h-6 w-6 grid place-items-center rounded-sm
                 border border-border bg-panel/90 text-faint
                 opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                 hover:text-foreground interactive
                 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? (
        <Check className="w-3 h-3 text-cyan" aria-hidden />
      ) : (
        <Copy className="w-3 h-3" aria-hidden />
      )}
    </button>
  );
};

export const MessageFormatter: React.FC<Props> = ({ content, sources, onCitationClick }) => {
  /** Set of known file names + paths, so citation validation is O(1). */
  const getKnownFiles = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources ?? []) {
      if (s.file_name) set.add(s.file_name);
      if (s.file_path) set.add(s.file_path);
    }
    return () => set;
  }, [sources]);

  /** Wrap text-bearing nodes so [file:line] tokens become chips. */
  const withCites = (children: React.ReactNode) =>
    onCitationClick ? renderWithCitations(children, onCitationClick, getKnownFiles) : children;

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1>{withCites(children)}</h1>,
          h2: ({ children }) => <h2>{withCites(children)}</h2>,
          h3: ({ children }) => <h3>{withCites(children)}</h3>,
          p: ({ children }) => <p>{withCites(children)}</p>,
          li: ({ children }) => <li>{withCites(children)}</li>,
          td: ({ children }) => <td>{withCites(children)}</td>,

          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className ?? '');
            const text = String(children).replace(/\n$/, '');

            // Inline code
            if (!match) {
              return <code {...props}>{children}</code>;
            }

            const lang = match[1];

            // Mermaid fences become live diagrams
            if (lang === 'mermaid') {
              return <MermaidBlock chart={text} />;
            }

            return (
              <div className="group relative my-3.5 rounded-md border border-border overflow-hidden">
                <div className="flex items-center h-7 px-2.5 border-b border-border bg-raised/60">
                  <span className="tag-mono">{lang}</span>
                </div>
                <CodeCopyButton text={text} />
                <SyntaxHighlighter
                  language={lang}
                  style={codeTheme}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    background: 'transparent',
                    padding: '0.75rem',
                    fontSize: '12.5px',
                    lineHeight: 1.6,
                  }}
                  codeTagProps={{ style: { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } }}
                  wrapLongLines
                >
                  {text}
                </SyntaxHighlighter>
              </div>
            );
          },

          table: ({ children }) => (
            <div className="my-3.5 overflow-x-auto rounded-md border border-border">
              <table>{children}</table>
            </div>
          ),

          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
