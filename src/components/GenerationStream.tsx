"use client";

import { useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";

/**
 * Consumes POST /api/demo/generate (SSE) and renders the staged
 * "watch the agent work" reveal. Demo mode only; the caller decides when to
 * mount it. Event protocol is documented in src/app/api/demo/generate/route.ts.
 */

type StageId = "sources" | "drafting" | "scanning" | "verifying";
type StageStatus = "pending" | "active" | "complete";

const STAGES: { id: StageId; label: string }[] = [
  { id: "sources", label: "Scanning 14 sources" },
  { id: "drafting", label: "Drafting in your voice" },
  { id: "scanning", label: "Checking 26 quality rules" },
  { id: "verifying", label: "Verifying claims to source" },
];

/** Hard ceiling for the whole run, and the longest silence tolerated mid-stream. */
const TOTAL_TIMEOUT_MS = 20_000;
const STALL_TIMEOUT_MS = 10_000;
/** Pause on the finished state so the last tick is visible before the card hands over. */
const HOLD_MS = 700;

type State = {
  phase: "running" | "done" | "failed";
  stages: Record<StageId, { status: StageStatus; result: string | null }>;
  text: string;
  recentRules: { ruleId: string; flagged: boolean }[];
  ruleIndex: number;
  ruleTotal: number;
  flaggedRules: string[];
  error: string | null;
};

const initialState: State = {
  phase: "running",
  stages: {
    sources: { status: "pending", result: null },
    drafting: { status: "pending", result: null },
    scanning: { status: "pending", result: null },
    verifying: { status: "pending", result: null },
  },
  text: "",
  recentRules: [],
  ruleIndex: 0,
  ruleTotal: 26,
  flaggedRules: [],
  error: null,
};

type StreamEvent =
  | { stage: StageId; status: "active"; total?: number }
  | { stage: "drafting"; status: "chunk"; text: string }
  | { stage: "scanning"; status: "tick"; ruleId: string; index: number; total: number; flagged: boolean }
  | { stage: StageId; status: "complete"; result?: string; flagged?: string[] }
  | { stage: "done"; draftId: string; remainingToday?: number }
  | { stage: "error"; message?: string };

type Action =
  | { type: "event"; event: StreamEvent }
  | { type: "fail"; message: string }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  if (action.type === "reset") return initialState;
  if (action.type === "fail") return { ...state, phase: "failed", error: action.message };

  const e = action.event;
  if (e.stage === "done") return { ...state, phase: "done" };
  if (e.stage === "error") return { ...state, phase: "failed", error: e.message ?? "Generation failed" };

  const stages = { ...state.stages };
  if (e.status === "active") {
    stages[e.stage] = { status: "active", result: null };
    return { ...state, stages };
  }
  if (e.status === "chunk") return { ...state, text: state.text + e.text };
  if (e.status === "tick") {
    return {
      ...state,
      recentRules: [...state.recentRules, { ruleId: e.ruleId, flagged: e.flagged }].slice(-3),
      ruleIndex: e.index,
      ruleTotal: e.total,
      flaggedRules: e.flagged ? [...state.flaggedRules, e.ruleId] : state.flaggedRules,
    };
  }
  // complete
  stages[e.stage] = { status: "complete", result: e.result ?? null };
  return {
    ...state,
    stages,
    flaggedRules: e.stage === "scanning" && e.flagged ? e.flagged : state.flaggedRules,
  };
}

export type GenerationResult = { draftId: string; remainingToday?: number };
export type GenerationFailure = { status?: number; code?: string; message: string };

export default function GenerationStream({
  topic,
  onComplete,
  onFailed,
  onDismiss,
}: {
  /** Present for quick-generate; omitted for "generate one". */
  topic?: string;
  /** Called after the stream reaches `done`, once the final state has been shown. */
  onComplete: (result: GenerationResult) => void;
  /** Called once per failed run (so the parent can sync quota etc). */
  onFailed?: (failure: GenerationFailure) => void;
  /** Close button on the failed state. */
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  const cbRef = useRef({ onComplete, onFailed });
  useEffect(() => {
    cbRef.current = { onComplete, onFailed };
  });

  useEffect(() => {
    dispatch({ type: "reset" });
    const ctrl = new AbortController();
    let settled = false;
    let lastEventAt = Date.now();
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    const totalTimer = setTimeout(
      () => fail({ message: "This is taking longer than expected. Try again." }),
      TOTAL_TIMEOUT_MS,
    );
    const stallTimer = setInterval(() => {
      if (Date.now() - lastEventAt > STALL_TIMEOUT_MS) {
        fail({ message: "The generation stalled. Try again." });
      }
    }, 1000);
    function cleanupTimers() {
      clearTimeout(totalTimer);
      clearInterval(stallTimer);
    }
    function fail(failure: GenerationFailure) {
      if (settled) return;
      settled = true;
      cleanupTimers();
      ctrl.abort();
      dispatch({ type: "fail", message: failure.message });
      cbRef.current.onFailed?.(failure);
    }

    // Deferred a tick so React StrictMode's mount/unmount/mount in dev cancels
    // the first run before it hits the server (each request mints a draft).
    const startTimer = setTimeout(async () => {
      try {
        const res = await fetch("/api/demo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(topic ? { topic } : {}),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          let code: string | undefined;
          try {
            code = ((await res.json()) as { code?: string }).code;
          } catch {
            /* non-JSON error body */
          }
          fail({
            status: res.status,
            code,
            message:
              res.status === 429
                ? "You've used all 3 quick generates for today. Resets at midnight."
                : "Could not generate a draft. Try again.",
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as StreamEvent;
            } catch {
              continue;
            }
            lastEventAt = Date.now();
            if (event.stage === "error") {
              fail({ message: event.message ?? "Generation failed. Try again." });
              return;
            }
            dispatch({ type: "event", event });
            if (event.stage === "done") {
              settled = true;
              cleanupTimers();
              const result = { draftId: event.draftId, remainingToday: event.remainingToday };
              holdTimer = setTimeout(() => cbRef.current.onComplete(result), HOLD_MS);
              return;
            }
          }
        }
        fail({ message: "The connection closed before the draft finished. Try again." });
      } catch {
        fail({ message: "Lost connection while generating. Try again." });
      }
    }, 0);

    return () => {
      settled = true;
      cleanupTimers();
      clearTimeout(startTimer);
      clearTimeout(holdTimer);
      ctrl.abort();
    };
  }, [topic, attempt]);

  const failed = state.phase === "failed";
  const ease = { duration: 0.2, ease: "easeOut" as const };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : ease}
      aria-live="polite"
      aria-busy={state.phase === "running"}
      className="bg-surface ink-edge mb-4 rounded-[10px] p-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="eyebrow text-ink-2">{failed ? "Generation failed" : "Agent working"}</span>
        {topic ? <span className="truncate text-[12px] text-ink-3">&ldquo;{topic}&rdquo;</span> : null}
      </div>

      <ul className="divide-y divide-hairline">
        {STAGES.map((stage, i) => {
          const s = state.stages[stage.id];
          const stoppedHere = failed && s.status === "active";
          return (
            <motion.li
              key={stage.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { ...ease, delay: 0.05 * i }}
              className="py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <StatusDot status={s.status} failed={stoppedHere} reduce={reduce} />
                <span className={`flex-1 text-[14px] ${s.status === "pending" ? "text-ink-3" : "text-ink"}`}>
                  {stage.label}
                </span>
                {stage.id === "scanning" && s.status === "active" ? (
                  <span className="font-mono text-[12px] tabular-nums text-ink-3">
                    {state.ruleIndex}/{state.ruleTotal}
                  </span>
                ) : null}
                {s.result ? <span className="font-mono text-[12px] text-ink-2">{s.result}</span> : null}
              </div>

              <AnimatePresence initial={false}>
                {stage.id === "drafting" && s.status !== "pending" ? (
                  <Reveal key="drafting" reduce={reduce}>
                    <DraftingText text={state.text} typing={s.status === "active" && !failed} reduce={reduce} />
                  </Reveal>
                ) : null}
                {stage.id === "scanning" && s.status !== "pending" ? (
                  <Reveal key="scanning" reduce={reduce}>
                    <RuleTicker state={state} done={s.status === "complete"} />
                  </Reveal>
                ) : null}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>

      <AnimatePresence initial={false}>
        {failed ? (
          <Reveal key="failed" reduce={reduce}>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
              <p className="text-[13px] text-ink">{state.error}</p>
              <div className="flex flex-shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => retry()}
                  className="text-[12px] font-medium text-accent-solid hover:text-accent-hover"
                >
                  Try again
                </button>
                <button type="button" onClick={onDismiss} className="text-[12px] text-ink-2 hover:text-ink">
                  Dismiss
                </button>
              </div>
            </div>
          </Reveal>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

/** Height-animated container so rows below ease down as detail panels appear. */
function Reveal({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

function StatusDot({ status, failed, reduce }: { status: StageStatus; failed: boolean; reduce: boolean }) {
  const base = "flex size-[18px] flex-shrink-0 items-center justify-center rounded-full";
  if (failed) {
    return (
      <span className={`${base} border-[1.5px] border-ink bg-p-coral`}>
        <X className="size-[10px] text-ink" strokeWidth={3} />
      </span>
    );
  }
  if (status === "complete") {
    return (
      <motion.span
        initial={reduce ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
        className={`${base} border-[1.5px] border-ink bg-p-sage`}
      >
        <Check className="size-[10px] text-ink" strokeWidth={3} />
      </motion.span>
    );
  }
  if (status === "active") {
    return (
      <span className={`${base} border-[1.5px] border-ink`}>
        <motion.span
          className="size-2 rounded-full bg-ink"
          animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
          transition={reduce ? undefined : { duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
    );
  }
  return <span className={`${base} border-[1.5px] border-ink-3`} />;
}

function DraftingText({ text, typing, reduce }: { text: string; typing: boolean; reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div
      ref={ref}
      className="mt-2.5 ml-[30px] max-h-44 overflow-y-auto rounded-md bg-paper p-3 text-[13px] leading-5 whitespace-pre-wrap text-ink"
    >
      {text}
      {typing ? (
        <motion.span
          aria-hidden
          className="ml-px inline-block h-[14px] w-[2px] translate-y-[2px] bg-ink"
          animate={reduce ? undefined : { opacity: [1, 1, 0, 0] }}
          transition={
            reduce ? undefined : { duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1], ease: "linear" }
          }
        />
      ) : null}
    </div>
  );
}

function RuleTicker({ state, done }: { state: State; done: boolean }) {
  return (
    <div className="mt-2.5 ml-[30px] font-mono text-[12px] leading-[18px]">
      {done ? null : (
        <div className="space-y-0.5">
          {state.recentRules.map((r, i, arr) => (
            <div
              key={`${state.ruleIndex - (arr.length - 1 - i)}-${r.ruleId}`}
              className={i === arr.length - 1 ? "text-ink" : "text-ink-3"}
            >
              {r.flagged ? "! " : "  "}
              {r.ruleId}
            </div>
          ))}
        </div>
      )}
      {state.flaggedRules.length > 0 ? (
        <div className={`flex flex-wrap gap-1.5 ${done ? "" : "mt-1.5"}`}>
          {state.flaggedRules.map((id) => (
            <span key={id} className="rounded-[4px] bg-p-amber px-1.5 py-px text-ink">
              {id}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
