"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Voiceprint } from "@/components/Voiceprint";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

// One-time fade-and-rise on enter. 24px travel, 400ms, 60ms stagger by index.
function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border-2 border-ink bg-accent-solid text-[15px] font-bold text-white shadow-[2px_2px_0_var(--ink)]">
        V
      </div>
      <span className="text-[15px] font-semibold text-ink">Voce</span>
    </div>
  );
}

const CONTRASTS: ReadonlyArray<{ ai: string; you: string }> = [
  { ai: "Let's delve into why this matters.", you: "We hit this at 2:40 AM on a Tuesday." },
  { ai: "It's not just a tool, it's a mindset.", you: "It cost us 11 hours of index rebuild." },
  { ai: "In today's fast-paced world...", you: "Our p50 went from 14 minutes to 3:50." },
];

const STEPS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  { n: "01", title: "Calibrate", body: "Paste a few posts you are proud of. Voce learns your cadence, not a template." },
  { n: "02", title: "Research", body: "Every morning it scans your topics and keeps only what is genuinely on-topic." },
  { n: "03", title: "Draft and check", body: "It writes, scans 26 quality rules, then verifies each claim against the source." },
  { n: "04", title: "Approve", body: "Nothing posts without you. Schedule it, edit it, or send it back." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper text-ink">
      {/* 1. Nav */}
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex h-24 max-w-[1280px] items-center justify-between gap-4 px-4 md:px-10">
          <LogoMark />
          <nav className="flex items-center gap-4 md:gap-6">
            <a href="#how-it-works" className="link-rule hidden text-[14px] font-medium text-ink sm:inline">
              How it works
            </a>
            <Link href="/login" className="link-rule text-[14px] font-medium text-ink">
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-14 md:grid-cols-2 md:gap-10 md:px-10 md:py-24">
          <div>
            <Reveal index={0}>
              <h1 className="display-xl text-ink">Post in your voice. Not the model&apos;s.</h1>
            </Reveal>
            <Reveal index={1}>
              <p className="mt-6 max-w-xl text-[20px] leading-[1.5] text-ink-2">
                Voce reads your sources each morning, drafts in a voice calibrated from your own writing, flags
                anything it cannot trace back to a source, and waits for your approval.
              </p>
            </Reveal>
            <Reveal index={2} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                Start free
              </Link>
              <Link href="/login" className="link-rule text-[15px] font-medium text-ink">
                Log in
              </Link>
            </Reveal>
            <Reveal index={3}>
              <p className="eyebrow mt-8 text-ink-3">Human approval before every post</p>
            </Reveal>
          </div>

          <Reveal index={2}>
            <div className="rounded-[10px] border-2 border-ink bg-p-blue p-5 sm:p-8 md:p-10">
              <div className="sticker-l rounded-[10px] border-2 border-ink bg-surface p-5 shadow-card sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <Chip tone="blue">AI Infrastructure</Chip>
                  <Voiceprint specificity={0.92} cadence={0.84} humanness={0.9} grounding={0.35} size={72} />
                </div>
                <div className="mt-4 space-y-3 text-[15px] leading-[1.55] text-ink">
                  <p>We rebuilt our vector index last week and the results surprised me.</p>
                  <p>Retrieval is faster. Our on-call pager is quieter. Nobody asked for a rewrite, but here we are.</p>
                  <p>
                    The part worth sharing: we cut our p99 latency by 40%, and it took one config change, not a new
                    cluster.
                  </p>
                </div>

                <div className="mt-5 border-t-2 border-dashed border-ink/25 pt-4">
                  <p className="eyebrow text-ink-2">Possible unsupported claim</p>
                  <div className="mt-3 border-l-2 border-dashed border-ink pl-4">
                    <p className="text-[15px] font-semibold leading-snug text-ink">
                      &lsquo;cut our p99 latency by 40%&rsquo;
                    </p>
                    <p className="mt-1.5 text-[14px] leading-snug text-ink-2">
                      <span className="font-medium">Source says:</span> the article reports a 22% reduction in
                      median latency and no p99 figure.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* 3. Everyone can tell */}
        <section className="border-y-2 border-ink bg-ink text-paper">
          <div className="mx-auto max-w-[1080px] px-4 py-16 md:px-10 md:py-24">
            <Reveal>
              <h2 className="display-2 text-center text-paper">Everyone can tell.</h2>
            </Reveal>
            <div className="mt-12 space-y-4">
              {CONTRASTS.map((row, i) => (
                <Reveal key={row.ai} index={i} className="grid gap-3 md:grid-cols-2 md:gap-4">
                  <div className="flex items-center rounded-[10px] border-2 border-dashed border-paper/50 p-5">
                    <p className="text-[17px] leading-snug text-paper/60 line-through">{row.ai}</p>
                  </div>
                  <div className="flex items-center rounded-[10px] border-2 border-paper bg-p-sage p-5">
                    <p className="text-[17px] font-medium leading-snug text-ink">{row.you}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <p className="eyebrow mt-10 text-center text-paper/70">
                Voce checks 26 rules like these before a draft reaches you
              </p>
            </Reveal>
          </div>
        </section>

        {/* 4. How it works */}
        <section id="how-it-works" className="scroll-mt-4 border-b-2 border-ink bg-paper-sunk">
          <div className="mx-auto max-w-[1280px] px-4 py-16 md:px-10 md:py-24">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} index={i}>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-p-blue font-mono text-[14px] font-medium text-ink"
                    aria-hidden="true"
                  >
                    {s.n}
                  </div>
                  <h3 className="display-3 mt-5 text-ink">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.55] text-ink-2">{s.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Final CTA */}
        <section className="bg-p-blue">
          <div className="mx-auto max-w-[1280px] px-4 py-20 text-center md:px-10 md:py-28">
            <Reveal>
              <h2 className="display-1 text-ink">Write like you.</h2>
            </Reveal>
            <Reveal index={1} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
              <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                Start free
              </Link>
              <Link href="/login" className="link-rule text-[15px] font-medium text-ink">
                Log in
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex min-h-[140px] max-w-[1280px] flex-col items-start justify-center gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between md:px-10">
          <LogoMark />
          <p className="text-[13px] text-ink-3">Drafts in your voice. Approved by you.</p>
        </div>
      </footer>
    </div>
  );
}
