/**
 * Landing — the public marketing page at `/`.
 *
 * Warm CRT-terminal aesthetic: phosphor green + terminal amber on warm black,
 * monospace labels with prompt markers, a display grotesque for headlines.
 *
 * Sections: Hero → How it works → Why different (comparison) →
 * Built for real code (stats) → CTA → Footer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  X,
  Github,
  Quote,
  GitPullRequest,
  Network,
  Share2,
  Terminal,
  GitBranch,
  FileSearch,
  MessageSquareCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { HomeConnect } from '@/components/landing/HomeConnect';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ utils */

const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-500 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5',
        className
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------ data */

const STEPS = [
  {
    n: '01',
    cmd: 'gitchat clone <repo>',
    title: 'Point it at a repo',
    body: 'Paste a GitHub URL or drag in a folder. Private repos work with one-click OAuth.',
    icon: GitBranch,
  },
  {
    n: '02',
    cmd: 'building index...',
    title: 'It reads everything',
    body: 'Files get chunked and embedded in under a minute. Build junk, lockfiles, and vendored code are skipped automatically.',
    icon: FileSearch,
  },
  {
    n: '03',
    cmd: 'ask "how does auth work?"',
    title: 'Ask in plain English',
    body: 'Answers stream back with clickable file:line citations that open the exact source.',
    icon: MessageSquareCode,
  },
];

const COMPARISON_BAD = [
  'Invents code that was never in your repo',
  'No idea which files actually exist',
  'Chokes once the repo is bigger than its context window',
  'You cannot verify a single claim it makes',
  'Same canned answer regardless of your code',
];

const COMPARISON_GOOD = [
  'Every claim cites a real file and line number',
  'Indexes and searches your whole repository',
  'Retrieval scales to codebases of any size',
  'Click any citation to jump straight to the source',
  'Diagrams, PR reviews, and shareable threads built in',
];

const CAPABILITIES = [
  { icon: Quote, title: 'Inline citations', body: 'Every claim links to a [file:line] you can click and check.' },
  { icon: Network, title: 'Live diagrams', body: 'Ask about architecture, get a rendered diagram — not prose.' },
  { icon: GitPullRequest, title: 'PR reviews', body: 'Name a PR and it pulls the diff to reason about the change.' },
  { icon: Share2, title: 'Share a thread', body: 'Turn any conversation into a read-only link for the team.' },
];

const STATS = [
  { value: '50+', label: 'languages & formats' },
  { value: '<60s', label: 'to index a mid repo' },
  { value: '100%', label: 'answers with sources' },
  { value: '0', label: 'bytes kept after session' },
];

const PROMPTS = [
  'trace the checkout flow',
  'what changed in PR #412?',
  'where is the auth guard?',
  'explain this service to me',
  'what could this rename break?',
  'which files import this module?',
];

/* -------------------------------------------------------------- component */

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ============================================================ hero */}
      <section className="relative overflow-hidden scanlines">
        <div className="absolute inset-0 -z-10 phosphor-glow animate-flicker" aria-hidden />
        <div
          className="absolute inset-0 -z-10 grid-backdrop fade-mask-b opacity-40"
          aria-hidden
        />

        {/* Minimal brand corners — no full navbar */}
        <div className="max-w-7xl mx-auto px-5 sm:px-6 pt-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 rounded-sm focus-ring">
            <span
              className="w-7 h-7 border border-primary/40 bg-primary/10 grid place-items-center"
              aria-hidden
            >
              <span className="font-mono text-sm font-bold text-primary">&gt;_</span>
            </span>
            <span className="font-display font-bold text-sm tracking-tight">gitchat</span>
          </Link>
          <div className="flex items-center gap-1">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="grid place-items-center w-8 h-8 text-muted hover:text-primary
                         hover:bg-raised/60 interactive focus-ring"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" aria-hidden />
            </a>
            <ThemeToggle className="h-8 w-8 p-0" />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-6 pt-14 sm:pt-16 pb-16 sm:pb-20">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-14 items-center">
            {/* Left — copy */}
            <div className="max-w-xl">
              <Reveal>
                <span
                  className="inline-flex items-center gap-2 px-2.5 h-7 border border-primary/30
                             bg-primary/[0.06] font-mono text-[11px] text-primary mb-7"
                >
                  <Terminal className="w-3 h-3" aria-hidden />
                  open source · reads private repos
                </span>
              </Reveal>

              <Reveal delay={70}>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.02]">
                  Talk to any
                  <br />
                  codebase like
                  <br />
                  <span className="text-primary">it's a teammate.</span>
                </h1>
              </Reveal>

              <Reveal delay={150}>
                <p className="mt-6 text-base sm:text-[17px] text-muted leading-relaxed">
                  <span className="text-primary font-mono">$</span> drop a repo, ask a
                  question. Every answer points back to the exact line it came from — no
                  hallucinated code, no hand-waving.
                </p>
              </Reveal>

              <Reveal delay={210}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="sm" className="h-11 px-5 text-sm gap-2 font-medium">
                    <a href="#start">
                      Start reading code
                      <ArrowRight className="w-4 h-4" aria-hidden />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-11 px-5 text-sm font-mono">
                    <a href="#how">./how-it-works</a>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={270}>
                <p className="mt-5 font-mono text-[11px] text-faint">
                  no signup · session-scoped · your code never persists
                </p>
              </Reveal>
            </div>

            {/* Right — demo */}
            <Reveal delay={180} className="hidden lg:block">
              <HeroDemo />
            </Reveal>
          </div>

          <Reveal delay={180} className="mt-10 lg:hidden">
            <HeroDemo />
          </Reveal>
        </div>
      </section>

      {/* ========================================================== connect */}
      <section id="start" className="relative border-t border-border scroll-mt-6">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <Reveal>
            <p className="eyebrow mb-4">get_started</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Point it at a repo.
            </h2>
            <p className="mt-3 text-[15px] text-muted leading-relaxed">
              Paste a GitHub URL or drop a folder. Indexing runs once, then you're
              straight into the conversation.
            </p>
          </Reveal>

          <Reveal delay={90} className="mt-7">
            <HomeConnect />
          </Reveal>
        </div>
      </section>

      {/* ===================================================== how it works */}
      <section id="how" className="relative border-t border-border scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <p className="eyebrow mb-4">how_it_works</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Three commands. Then ask.
            </h2>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-px bg-border border border-border">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.n} delay={i * 90} className="bg-background">
                  <div className="group relative h-full p-6 sm:p-7 hover:bg-panel/50 transition-colors duration-300">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-sm text-primary">[{s.n}]</span>
                      <Icon className="w-4 h-4 text-faint group-hover:text-primary transition-colors" aria-hidden />
                    </div>

                    {/* Fake terminal line */}
                    <div className="mt-5 font-mono text-[11px] text-muted border border-border bg-panel/60 px-2.5 py-1.5 truncate">
                      <span className="text-primary">$</span> {s.cmd}
                    </div>

                    <h3 className="mt-5 font-display text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted leading-relaxed">{s.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================ why it's different */}
      <section id="compare" className="relative border-t border-border scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <p className="eyebrow mb-4">why_gitchat</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl">
              Not a chatbot with a repo pasted in.
            </h2>
            <p className="mt-4 text-base text-muted max-w-2xl leading-relaxed">
              Most AI tools shove your question into a generic model and cross their
              fingers. gitchat actually indexes your repository and grounds every answer
              in code it retrieved — so you can trust it, and check it.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-2 border border-border">
            {/* Bad */}
            <Reveal delay={70}>
              <div className="h-full p-6 sm:p-8 border-b md:border-b-0 md:border-r border-border">
                <div className="flex items-center gap-2.5 mb-6 font-mono text-sm text-muted">
                  <span className="w-6 h-6 border border-destructive/30 bg-destructive/10 grid place-items-center">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </span>
                  // generic AI chatbots
                </div>
                <ul className="space-y-4">
                  {COMPARISON_BAD.map(point => (
                    <li key={point} className="flex items-start gap-3">
                      <span className="font-mono text-destructive/80 leading-relaxed shrink-0">✗</span>
                      <span className="text-sm text-muted leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Good */}
            <Reveal delay={140}>
              <div className="relative h-full p-6 sm:p-8 bg-primary/[0.03]">
                <div
                  className="absolute top-0 left-0 right-0 h-px bg-primary/50"
                  aria-hidden
                />
                <div className="flex items-center gap-2.5 mb-6 font-mono text-sm">
                  <span className="w-6 h-6 border border-primary/40 bg-primary/10 grid place-items-center">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <span className="text-primary">// gitchat</span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-primary/70">
                    you are here
                  </span>
                </div>
                <ul className="space-y-4">
                  {COMPARISON_GOOD.map(point => (
                    <li key={point} className="flex items-start gap-3">
                      <span className="font-mono text-primary leading-relaxed shrink-0">✓</span>
                      <span className="text-sm leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================== capabilities */}
      <section className="relative border-t border-border scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <p className="eyebrow mb-4">capabilities</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight max-w-xl">
              More than a chat box.
            </h2>
          </Reveal>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
            {CAPABILITIES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 70} className="bg-background">
                  <div className="group h-full p-6 hover:bg-panel/50 transition-colors duration-300">
                    <div className="w-9 h-9 border border-border bg-panel grid place-items-center mb-4 group-hover:border-primary/40 transition-colors">
                      <Icon className="w-4 h-4 text-primary" aria-hidden />
                    </div>
                    <h3 className="font-display text-[15px] font-bold">{f.title}</h3>
                    <p className="mt-1.5 text-[13px] text-muted leading-relaxed">{f.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================================== built for real code */}
      <section className="relative border-t border-border scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <p className="eyebrow mb-4">by_the_numbers</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight max-w-lg">
              Receipts, not promises.
            </h2>
          </Reveal>

          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 70} className="bg-background">
                <div className="p-6 sm:p-8">
                  <span className="font-display text-4xl sm:text-5xl font-extrabold text-primary tabular-nums">
                    {s.value}
                  </span>
                  <p className="mt-2 font-mono text-[11px] text-muted">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={160}>
            <div className="mt-10">
              <p className="font-mono text-[11px] text-faint mb-4">// stuff people actually ask</p>
              <div className="flex flex-wrap gap-2">
                {PROMPTS.map(p => (
                  <span
                    key={p}
                    className="font-mono text-[12.5px] px-3 py-1.5 border border-border bg-panel/50
                               text-muted hover:border-primary/40 hover:text-primary
                               transition-colors duration-200 cursor-default"
                  >
                    <span className="text-primary/60">$</span> {p}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =============================================================== cta */}
      <section className="relative border-t border-border overflow-hidden scanlines">
        <div className="absolute inset-0 -z-10 phosphor-glow opacity-70" aria-hidden />
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-24 sm:py-32 text-center">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight">
              Run it on your own repo.
            </h2>
            <p className="mt-4 text-base text-muted max-w-md mx-auto leading-relaxed">
              Under a minute to index. No signup, no card, no vendor lock-in.
            </p>
          </Reveal>

          <Reveal delay={90}>
            <div className="mt-8 inline-flex items-center gap-3 font-mono text-sm border border-border bg-panel/70 px-4 h-11">
              <span className="text-primary">$</span>
              <span className="text-foreground">gitchat</span>
              <span className="text-muted term-cursor" />
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-8 flex justify-center">
              <Button asChild size="sm" className="h-11 px-6 text-sm gap-2 font-medium">
                <a href="#start">
                  Point it at a repo
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </a>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ footer */}
      <footer className="border-t border-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-12 sm:py-14">
          <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-start">
            <div>
              <Link to="/" className="flex items-center gap-2.5 rounded-sm focus-ring w-fit">
                <span className="w-7 h-7 border border-primary/40 bg-primary/10 grid place-items-center" aria-hidden>
                  <span className="font-mono text-sm font-bold text-primary">&gt;_</span>
                </span>
                <span className="font-display font-bold text-sm tracking-tight">gitchat</span>
              </Link>
              <p className="mt-3 text-sm text-muted max-w-xs leading-relaxed">
                Talk to any codebase like it's a teammate. Grounded answers, real
                citations, zero hallucinated code.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-faint mb-3">product</h4>
                <ul className="space-y-2">
                  <li><Link to="/app" className="text-sm text-muted hover:text-primary transition-colors focus-ring rounded-sm">open app</Link></li>
                  <li><a href="#how" className="text-sm text-muted hover:text-primary transition-colors focus-ring rounded-sm">how it works</a></li>
                  <li><a href="#compare" className="text-sm text-muted hover:text-primary transition-colors focus-ring rounded-sm">why gitchat</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-faint mb-3">connect</h4>
                <ul className="space-y-2">
                  <li>
                    <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors focus-ring rounded-sm">
                      <Github className="w-3.5 h-3.5" aria-hidden />
                      github
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-faint">
              <span className="text-primary/60">$</span> echo "&copy; {new Date().getFullYear()} gitchat"
            </p>
            <p className="font-mono text-[11px] text-faint">built with fastapi + react</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
