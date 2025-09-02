"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Copy, Check } from "lucide-react";

interface MessageFormatterProps {
  content: string;
}

// Copy Button Component
const CopyButton: React.FC<{ text: string; className?: string }> = ({ text, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`absolute top-2 right-2 p-1.5 bg-gray-700/80 hover:bg-gray-600/80 rounded-md transition-colors group ${className}`}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <Copy className="w-4 h-4 text-gray-300 group-hover:text-white" />
      )}
    </button>
  );
};

export const MessageFormatter: React.FC<MessageFormatterProps> = ({ content }) => {
  return (
    <div className="prose prose-invert max-w-none break-words overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-purple-500 mt-6 mb-4 break-words"
            >
              {children}
            </motion.h1>
          ),
          h2: ({ children }) => (
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold text-purple-400 mt-5 mb-3 break-words"
            >
              {children}
            </motion.h2>
          ),
          h3: ({ children }) => (
            <motion.h3
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg font-bold text-purple-300 mt-4 mb-2 break-words"
            >
              {children}
            </motion.h3>
          ),

          // Paragraphs with better spacing
          p: ({ children }) => (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 text-gray-100 leading-relaxed break-words whitespace-pre-wrap"
            >
              {children}
            </motion.p>
          ),

          // Lists with better spacing
          ul: ({ children }) => (
            <motion.ul
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="list-disc ml-6 mb-4 text-gray-200 space-y-2"
            >
              {children}
            </motion.ul>
          ),
          ol: ({ children }) => (
            <motion.ol
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="list-decimal ml-6 mb-4 text-gray-200 space-y-2"
            >
              {children}
            </motion.ol>
          ),
          li: ({ children }) => (
            <li className="mb-2 break-words leading-relaxed">{children}</li>
          ),

          // Enhanced code blocks with copy button
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const inline = !match;
            
            if (inline) {
              return (
                <code className="bg-gray-800 text-purple-300 px-1.5 py-0.5 rounded text-sm break-words">
                  {children}
                </code>
              );
            }
            
            return (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="my-4 overflow-hidden relative group"
              >
                <CopyButton text={codeString} />
                <SyntaxHighlighter
                  style={atomDark}
                  language={match ? match[1] : "text"}
                  PreTag="div"
                  customStyle={{
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                    padding: "1rem",
                    paddingTop: "2.5rem", // Space for copy button
                    background: "#282a36",
                    overflowX: "auto",
                    maxWidth: "100%",
                  }}
                  wrapLines={true}
                  wrapLongLines={true}
                >
                  {codeString}
                </SyntaxHighlighter>
              </motion.div>
            );
          },

          // Better table handling with copy option
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 relative group">
              <CopyButton 
                text={extractTableText(children)} 
                className="top-0 right-0" 
              />
              <table className="min-w-full border-collapse border border-gray-600 text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-800">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody>{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-gray-600">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="border border-gray-600 px-3 py-2 break-words max-w-xs">
              {children}
            </td>
          ),
          th: ({ children }) => (
            <th className="border border-gray-600 px-3 py-2 font-semibold text-purple-300">
              {children}
            </th>
          ),

          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-300 underline hover:text-purple-200 break-words"
            >
              {children}
            </a>
          ),

          // Block quotes for better emphasis
          blockquote: ({ children }) => (
            <motion.blockquote
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="border-l-4 border-purple-500 pl-4 my-4 italic text-gray-300 bg-gray-800/30 py-2 rounded-r relative group"
            >
              <CopyButton 
                text={extractTextFromChildren(children)} 
                className="top-2 right-2" 
              />
              {children}
            </motion.blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// Helper functions for extracting text from React elements
function extractTableText(children: any): string {
  // Simple text extraction for tables - can be enhanced
  return "Table content"; // Implement based on your needs
}

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }
  if (children?.props?.children) {
    return extractTextFromChildren(children.props.children);
  }
  return '';
}
