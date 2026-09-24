/**
 * HeroDemo — the animated centrepiece of the landing page.
 *
 * Runs a scripted loop of the product's core value: a question is typed, an
 * answer streams in with inline citations, a citation activates, and the source
 * panel jumps to that exact line. No network, no real LLM — it's a
 * deterministic script, which keeps the landing page fast and the messaging
 * honest (the content mirrors what the product actually produces).
 *
 * Respects `prefers-reduced-motion` by jumping straight to the settled final
 * frame instead of animating.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileCode, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One step of the scripted demo. */
interface Scene {
  question: string;
  /** Answer is revealed progressively; `cite` marks the clickable span. */
  answer: Array<{ text: string } | { cite: string }>;
  file: string;
  /** 1-indexed lines to highlight in the source panel */
  highlight: [number, number];
  code: string[];
}

const SCENES: Scene[] = [
  {
    question: 'Where do we validate the plan?',
    answer: [
      { text: 'In the billing guard, before the controller runs — it rejects the request if the workspace plan is missing or expired ' },
      { cite: 'billing.guard.ts:22-28' },
      { text: '.' },
    ],
    file: 'src/billing/billing.guard.ts',
    highlight: [22, 28],
    code: [
      'import { CanActivate, ExecutionContext } from "@nestjs/common";',
      'import { PlanService } from "./plan.service";',
      '',
      '@Injectable()',
      'export class BillingGuard implements CanActivate {',
      '  constructor(private readonly plans: PlanService) {}',
      '',
      '  async canActivate(ctx: ExecutionContext) {',
      '    const req = ctx.switchToHttp().getRequest();',
      '    const workspace = req.workspace;',
      '',
      '    if (!workspace) {',
      '      throw new UnauthorizedException("No workspace on request");',
      '    }',
      '',
      '    const plan = await this.plans.forWorkspace(workspace.id);',
      '',
      '    if (!plan) {',
      '      throw new ForbiddenException("No active plan");',
      '    }',
      '',
      '    if (plan.expiresAt < new Date()) {',
      '      throw new ForbiddenException("Plan expired");',
      '    }',
      '',
      '    req.plan = plan;',
      '    return true;',
      '  }',
      '}',
    ],
  },
  {
    question: 'What could break if I rename orderTotal?',
    answer: [
      { text: 'Three call sites depend on it. The riskiest is the webhook reconciler, which reads the field off a persisted payload ' },
      { cite: 'reconcile.ts:41-44' },
      { text: ' — renaming the property breaks stored records, not just code.' },
    ],
    file: 'src/payments/reconcile.ts',
    highlight: [41, 44],
    code: Array.from({ length: 36 }, (_, i) =>
      [
        'import { stripe } from "./client";',
        'import { db } from "../db";',
        '',
        'export async function reconcile(eventId: string) {',
        '  const event = await stripe.events.retrieve(eventId);',
        '  const stored = await db.payment.findUnique({',
        '    where: { eventId },',
        '  });',
        '',
        '  if (!stored) return;',
      ][i % 10]
    ).concat([
      '',
      '  // Persisted payloads still carry the original field name,',
      '  // so a rename here must be paired with a migration.',
      '  const expected = stored.payload.orderTotal;',
      '  const actual = event.data.object.amount_total;',
      '',
      '  if (expected !== actual) {',
      '    await flagMismatch(stored.id, expected, actual);',
      '  }',
      '}',
    ]),
  },
];

/** Typing cadence, ms per character. */
const TYPE_MS = 34;
/** Answer reveal cadence, ms per token group. */
const REVEAL_MS = 26;

type Phase = 'typing' | 'thinking' | 'answering' | 'settled';

export const HeroDemo: React.FC<{ className?: string }> = ({ className }) => {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const [sceneIndex, setSceneIndex] = useState(0);
  const [typed, setTyped] = useState(reduced ? SCENES[0].question : '');
  const [revealed, setRevealed] = useState(reduced ? Number.MAX_SAFE_INTEGER : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? 'settled' : 'typing');
  const [citeActive, setCiteActive] = useState(reduced);

  const scene = SCENES[sceneIndex];
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Drive the scripted loop. Each scene: type → think → answer → settle → next.
  useEffect(() => {
    if (reduced) return;
    clearTimers();
    setTyped('');
    setRevealed(0);
    setCiteActive(false);
    setPhase('typing');

    const q = scene.question;
    for (let i = 1; i <= q.length; i++) {
      after(i * TYPE_MS, () => setTyped(q.slice(0, i)));
    }

    const typedDone = q.length * TYPE_MS + 260;
    after(typedDone, () => setPhase('thinking'));

    const thinkDone = typedDone + 620;
    after(thinkDone, () => setPhase('answering'));

    const groups = scene.answer.length;
    for (let i = 1; i <= groups; i++) {
      after(thinkDone + i * (REVEAL_MS * 14), () => setRevealed(i));
    }

    const answerDone = thinkDone + groups * (REVEAL_MS * 14) + 300;
    after(answerDone, () => {
      setCiteActive(true);
      setPhase('settled');
    });

    // Hold the settled frame, then advance
    after(answerDone + 3200, () => setSceneIndex(i => (i + 1) % SCENES.length));

    return clearTimers;
  }, [sceneIndex, reduced, scene]);

  const [hlStart, hlEnd] = scene.highlight;

  // Show a window of code centred on the highlight so the panel always has
  // the cited lines in view without needing to scroll.
  const windowStart = Math.max(0, hlStart - 6);
  const visible = scene.code.slice(windowStart, windowStart + 16);

  return (
    <div className={cn('window', className)} aria-hidden="true">
      {/* Frame chrome */}
      <div className="window-bar">
        <span className="window-dots" />
        <span className="ml-1 font-mono text-2xs text-faint truncate">
          acme/platform
        </span>
        <span className="ml-auto flex items-center gap-1 tag-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
          indexed
        </span>
      </div>

      <div className="grid md:grid-cols-[1.15fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Conversation side */}
        <div className="p-4 sm:p-5 min-h-[19rem] flex flex-col">
          {/* Question */}
          <div className="flex items-start gap-2.5">
            <span className="message-gutter text-faint pt-px">you</span>
            <p className="text-[13.5px] leading-relaxed text-foreground min-h-[1.4em]">
              {typed}
              {phase === 'typing' && (
                <span className="inline-block w-[2px] h-[1.05em] ml-px align-text-bottom bg-primary animate-pulse" />
              )}
            </p>
          </div>

          {/* Answer */}
          {(phase === 'thinking' || phase === 'answering' || phase === 'settled') && (
            <div className="flex items-start gap-2.5 mt-5">
              <span className="message-gutter text-primary/70 pt-px">codechat</span>
              <div className="min-w-0 flex-1">
                {phase === 'thinking' ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1 h-1 rounded-full bg-primary/70 animate-bounce"
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </span>
                    searching 1,284 chunks
                  </span>
                ) : (
                  <p className="text-[13.5px] leading-relaxed text-foreground/90">
                    {scene.answer.slice(0, revealed).map((part, i) =>
                      'cite' in part ? (
                        <span
                          key={i}
                          className={cn(
                            'citation-chip mx-0.5 transition-all',
                            citeActive && 'bg-primary/25 border-primary/70'
                          )}
                        >
                          {part.cite}
                        </span>
                      ) : (
                        <span key={i}>{part.text}</span>
                      )
                    )}
                  </p>
                )}

                {/* Source strip */}
                {phase === 'settled' && (
                  <div className="mt-3.5 pt-3 border-t border-border/60 animate-fade-in">
                    <span className="tag-mono">sources</span>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-border bg-raised/60">
                        <FileCode className="w-2.5 h-2.5 text-faint" />
                        <span className="font-mono text-2xs text-muted">
                          {scene.file.split('/').pop()}
                        </span>
                      </span>
                      <span className="tag-mono">+2 more</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Inert composer */}
          <div className="mt-4 flex items-center gap-2 h-9 px-2.5 rounded-md border border-border bg-raised/40">
            <span className="text-xs text-faint flex-1 truncate">
              Ask about this codebase…
            </span>
            <CornerDownLeft className="w-3 h-3 text-faint shrink-0" />
          </div>
        </div>

        {/* Source side */}
        <div className="bg-background/40 flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 h-9 px-3 border-b border-border shrink-0">
            <FileCode className="w-3 h-3 text-faint shrink-0" />
            <span className="font-mono text-2xs truncate">
              {scene.file.split('/').pop()}
            </span>
            <span
              className={cn(
                'font-mono text-2xs shrink-0 transition-colors',
                citeActive ? 'text-primary' : 'text-faint'
              )}
            >
              :{hlStart}-{hlEnd}
            </span>
            <span className="ml-auto flex items-center gap-1 tag-mono shrink-0">
              <Lock className="w-2.5 h-2.5" />
              read-only
            </span>
          </div>

          <div className="flex-1 overflow-hidden py-1.5">
            {visible.map((line, i) => {
              const lineNo = windowStart + i + 1;
              const isHl = citeActive && lineNo >= hlStart && lineNo <= hlEnd;
              return (
                <div
                  key={lineNo}
                  className={cn(
                    'flex items-start gap-2.5 px-3 transition-colors duration-300',
                    isHl && 'line-cited'
                  )}
                >
                  <span className="font-mono text-2xs text-faint tabular-nums select-none w-5 text-right shrink-0">
                    {lineNo}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[11px] leading-[1.55] whitespace-pre truncate',
                      isHl ? 'text-foreground' : 'text-muted'
                    )}
                  >
                    {line || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
