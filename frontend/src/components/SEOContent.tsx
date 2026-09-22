/**
 * SEO Content Section
 *
 * Renders real, indexable text content below the fold so search engines
 * have material to index even when JavaScript rendering is limited.
 * Uses semantic HTML (h1/h2, article, section) for better SEO signals.
 */
import React from 'react';

export const SEOContent: React.FC = () => {
  return (
    <section
      className="max-w-4xl mx-auto mt-24 mb-16 px-4 prose prose-invert prose-headings:text-foreground prose-p:text-muted-foreground"
      aria-label="About CodeChat AI"
    >
      <article>
        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          AI Code Review Tool: Chat with Your GitHub Repository
        </h1>
        <p className="text-lg leading-relaxed">
          CodeChat AI is a free, RAG-based code analysis tool that lets you have a conversation
          with any codebase. Paste a GitHub repository URL or upload your files, and ask questions
          in plain English. Get instant answers about architecture, dependencies, bugs, and code
          quality without reading every file yourself.
        </p>

        <h2 className="text-2xl font-semibold mt-10 mb-4">What Can You Do With CodeChat AI?</h2>
        <ul className="space-y-2">
          <li><strong>Summarize a codebase</strong> — get a high-level overview of what a repo does, its main modules, and how they interact.</li>
          <li><strong>Find bugs and vulnerabilities</strong> — spot common issues, error handling gaps, and security concerns across files.</li>
          <li><strong>Analyze architecture</strong> — understand design patterns, data flow, and dependencies between components.</li>
          <li><strong>Explore unfamiliar code</strong> — onboard onto a new project by asking "how does X work?" instead of grep-ing.</li>
          <li><strong>Get improvement suggestions</strong> — receive concrete recommendations for refactoring and best practices.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">How CodeChat AI Works</h2>
        <p>
          CodeChat AI uses Retrieval-Augmented Generation (RAG) to give you accurate answers
          grounded in your actual code, not hallucinations. When you upload a repo, we clone it,
          split each file into semantic chunks, and store vector embeddings in Pinecone. When you
          ask a question, we retrieve the most relevant code sections and pass them to a large
          language model (OpenAI's gpt-oss-120b via Groq) which composes an answer citing the
          specific files it referenced.
        </p>

        <h2 className="text-2xl font-semibold mt-10 mb-4">Supported Languages and File Types</h2>
        <p>
          CodeChat AI supports most popular languages including Python, JavaScript, TypeScript,
          Java, Go, Rust, C, C++, C#, Ruby, PHP, Swift, and Kotlin. It also indexes web files
          (HTML, CSS), config files (JSON, YAML), documentation (Markdown), Jupyter notebooks,
          and SQL. Build artifacts, lockfiles, and dependency folders like <code>node_modules</code> are
          skipped automatically.
        </p>

        <h2 className="text-2xl font-semibold mt-10 mb-4">Who Is This For?</h2>
        <ul className="space-y-2">
          <li><strong>Open-source contributors</strong> exploring a project before their first PR.</li>
          <li><strong>Engineers joining a new team</strong> who need to ramp on unfamiliar code fast.</li>
          <li><strong>Code reviewers</strong> looking for a second opinion on architecture or bugs.</li>
          <li><strong>Students and learners</strong> studying real-world codebases.</li>
          <li><strong>Solo developers</strong> who want a rubber duck that actually reads the code.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">Frequently Asked Questions</h2>

        <h3 className="text-xl font-semibold mt-6 mb-2">Is CodeChat AI free?</h3>
        <p>Yes. The tool is free to use with public GitHub repositories.</p>

        <h3 className="text-xl font-semibold mt-6 mb-2">Does it work with private repositories?</h3>
        <p>
          The current version supports public repositories. Private repo support via GitHub
          Personal Access Tokens is on the roadmap.
        </p>

        <h3 className="text-xl font-semibold mt-6 mb-2">How is this different from GitHub Copilot?</h3>
        <p>
          Copilot autocompletes code as you type. CodeChat AI answers questions about existing
          codebases. Think of Copilot as a co-writer and CodeChat as a code archaeologist.
        </p>

        <h3 className="text-xl font-semibold mt-6 mb-2">Is my code stored anywhere?</h3>
        <p>
          Files are stored temporarily during your session in an isolated namespace. When you
          reset the session, the data is removed. Nothing is used for training.
        </p>

        <h3 className="text-xl font-semibold mt-6 mb-2">What large language model does it use?</h3>
        <p>
          CodeChat AI uses OpenAI's gpt-oss-120b served through Groq for fast inference, combined
          with Pinecone's hosted embeddings (multilingual-e5-large) and BGE reranker for
          retrieval quality.
        </p>
      </article>
    </section>
  );
};
