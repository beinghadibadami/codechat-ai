/**
 * Landing — the public marketing page at `/`.
 *
 * Deliberately outside AppShell: a first-time visitor has no session, so
 * workspace navigation would be noise. Everything claimed here maps to
 * behaviour that actually exists in the product.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Github,
  HardDrive,
  Quote,
  GitPullRequest,
  Network,
  Share2,
  Search,
  Lock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LandingNav } from '@/components/landing/LandingNav';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ data */

const STEPS = [
  {
    n: '01',
    title: 'Point it at a codebase',
    body: 'Paste a GitHub URL or drop a folder from your machine. Private repos work once you connect GitHub.',
    icon: Github,
  },
  {
    n: '02',
    title: 'It builds an index',
    body: 'Files are split into semantic chunks and embedded. Build output, lockfiles and generated bundles are skipped.',
    icon: Search,
  },
  {
    n: '03',
    title: 'Ask in plain English',
    body: 'Answers arrive streaming, with citations that open the exact file and line they came from.',
    icon: Quote,
  },
];

const FEATURES = [
  {
    icon: Quote,
    title: 'Citations you can check',
    body: 'Every claim carries a [file:line] reference. Click it and the source panel opens at that line. Citations that cannot be matched to a retrieved chunk are greyed out rather than turned into dead links.',
    accent: 'amber' as const,
  },
  {
    icon: Network,
    title: 'Diagrams, not walls of text',
    body: 'Ask how a request flows and you get a rendered diagram scoped to what you asked about — not a two-hundred-node map of the whole repository.',
    accent: 'cyan' as const,
  },
  {
    icon: GitPullRequest,
    title: 'Pull requests in context',
    body: 'Mention a PR and its diff is fetched and attached. It reasons over the change and the surrounding code together, so "what could this break?" is answerable.',
    accent: 'amber' as const,
  },
  {
    icon: Share2,
    title: 'Shareable findings',
    body: 'Turn a thread into a read-only link. Teammates read the questions, answers and citations without re-indexing anything themselves.',
    accent: 'cyan' as const,
  },
];

const LANGUAGES = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java',
  'Ruby', 'PHP', 'C#', 'C++', 'Swift', 'Kotlin',
  'Scala', 'Elixir', 'SQL', 'Vue', 'Svelte', 'Markdown',
];

const PROMPTS = [
  'Trace the checkout flow',
  'What changed in #412?',
  'Where do we validate the plan?',
  'Explain this service like I joined today',
  'What could break if I rename this field?',
  'Which files depend on the auth guard?',
];

/* -------------------------------------------------------------- component */

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="eyebrow mb-3">{children}</p>
);

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      {/* ============================================================ hero */}
      <section className="relative overflow-hidden">
        {/* Decorative backdrop */}
        <div className="absolute inset-0 -z-10 hero-glow" aria-hidden />
        <div
          className="absolute inset-0 -z-10 grid-backdrop fade-mask-b opacity-40"
          aria-hidden
        />

        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 sm:pt-24 pb-14">
          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full
                         border border-border bg-raised/60 text-2xs text-muted mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan" aria-hidden />
              Works with public and private repositories
            </span>

            <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.04]">
              Talk to your code.
              <br />
              <span className="text-muted">Build with context.</span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-muted leading-relaxed max-w-xl">
              Ask questions about an entire codebase and get answers that point back at
              the exact lines they came from. Trace a flow, review a pull request, or get
              oriented in a repository you have never opened before.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="sm" className="h-10 px-4 text-[13px] gap-2">
                <Link to="/app">
                  Try it on your repo
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-10 px-4 text-[13px]">
                <a href="#how">See how it works</a>
              </Button>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
              <Lock className="w-3 h-3" aria-hidden />
              No account needed. Your code stays scoped to your session.
            </p>
          </div>

          {/* The demo */}
          <div className="mt-12 sm:mt-16">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ===================================================== how it works */}
      <section id="how" className="border-t border-border scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-lg">
            Three steps, then ask anything
          </h2>

          <ol className="mt-10 grid md:grid-cols-3 border border-border rounded-lg overflow-hidden">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.n}
                  className={cn(
                    'cell bg-panel/40',
                    i > 0 && 'border-t md:border-t-0 md:border-l'
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-2xs text-primary">{s.n}</span>
                    <Icon className="w-4 h-4 text-muted" aria-hidden />
                  </div>
                  <h3 className="text-[15px] font-medium">{s.title}</h3>
                  <p className="mt-2 text-[13px] text-muted leading-relaxed">{s.body}</p>
                </li>
              );
            })}
          </ol>

          {/* Two ways in — equal weight, matching the product */}
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {[
              {
                icon: Github,
                tag: 'remote',
                title: 'GitHub repository',
                body: 'Shallow clone of the default branch. Connect your account for private repos.',
              },
              {
                icon: HardDrive,
                tag: 'disk',
                title: 'Local files',
                body: 'Drop a folder or pick individual source files. Nothing leaves your session.',
              },
            ].map(o => {
              const Icon = o.icon;
              return (
                <div key={o.title} className="panel p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted" aria-hidden />
                    <h3 className="text-[13px] font-medium">{o.title}</h3>
                    <span className="tag-mono ml-auto">{o.tag}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted leading-relaxed">{o.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= features */}
      <section id="features" className="border-t border-border scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <SectionLabel>Features</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
            Built for verifying, not just reading
          </h2>

          <div className="mt-10 grid md:grid-cols-2 border border-border rounded-lg overflow-hidden">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={cn(
                    'cell bg-panel/40',
                    // Hairline grid without doubling borders
                    i % 2 === 1 && 'md:border-l',
                    i >= 2 && 'border-t'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-md border grid place-items-center mb-3.5',
                      f.accent === 'amber'
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-cyan/30 bg-cyan/10'
                    )}
                    aria-hidden
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4',
                        f.accent === 'amber' ? 'text-primary' : 'text-cyan'
                      )}
                    />
                  </div>
                  <h3 className="text-[15px] font-medium">{f.title}</h3>
                  <p className="mt-2 text-[13px] text-muted leading-relaxed">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================== prompts */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <SectionLabel>In practice</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-lg">
            The kind of thing people actually ask
          </h2>

          <ul className="mt-8 flex flex-wrap gap-2">
            {PROMPTS.map(p => (
              <li
                key={p}
                className="px-3 py-1.5 rounded-full border border-border bg-panel/60
                           text-[13px] text-muted"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ======================================================= languages */}
      <section id="languages" className="border-t border-border scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <SectionLabel>Languages</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-lg">
            Reads most of what you write
          </h2>
          <p className="mt-3 text-[13px] text-muted max-w-lg leading-relaxed">
            Source, config, and docs are indexed. Dependencies, build output, minified
            bundles, generated code and whole-repo dump files are filtered out before
            anything is embedded.
          </p>

          <ul className="mt-8 flex flex-wrap gap-1.5">
            {LANGUAGES.map(l => (
              <li
                key={l}
                className="font-mono text-xs px-2 py-1 rounded-sm border border-border
                           bg-raised/50 text-muted"
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* =============================================================== cta */}
      <section className="border-t border-border relative overflow-hidden">
        <div className="absolute inset-0 -z-10 hero-glow opacity-70" aria-hidden />
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Open a repository and ask something
          </h2>
          <p className="mt-4 text-[14.5px] text-muted max-w-md mx-auto leading-relaxed">
            Indexing a mid-sized repo takes about a minute. There is nothing to install
            and no account to create.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="sm" className="h-10 px-5 text-[13px] gap-2">
              <Link to="/app">
                Get started
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {['No signup', 'Public and private repos', 'Session-scoped'].map(x => (
              <li key={x} className="flex items-center gap-1.5 text-xs text-faint">
                <Check className="w-3 h-3 text-cyan" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============================================================ footer */}
      <footer className="border-t border-border">
        <div
          className="max-w-6xl mx-auto px-5 sm:px-6 py-8 flex flex-col sm:flex-row
                     items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-sm bg-primary/15 border border-primary/30 grid place-items-center"
              aria-hidden
            >
              <span className="font-mono text-[10px] font-semibold text-primary">C</span>
            </span>
            <span className="text-xs text-muted">
              CodeChat AI — ask questions about any codebase
            </span>
          </div>

          <nav className="flex items-center gap-4" aria-label="Footer">
            <Link to="/app" className="text-xs text-muted hover:text-foreground focus-ring rounded-sm">
              Open app
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-foreground focus-ring rounded-sm"
            >
              Source
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
