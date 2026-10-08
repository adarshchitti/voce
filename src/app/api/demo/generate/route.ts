import { isDemo } from "@/lib/demo/mode";
import { demoDrafts } from "@/lib/demo/drafts";
import { STATIC_QUALITY_RULES } from "@/lib/ai/quality-rules";

/**
 * Demo-only staged generation stream (UI_OVERHAUL_PLAN.md §6.2).
 *
 * Server-Sent Events, one JSON object per `data:` line. The draft is minted
 * from the fixture store up front, then the pipeline is narrated with
 * deliberate delays so an audience can follow it. Nothing here calls a model.
 *
 * Event protocol (discriminated on `stage` + `status`):
 *   { stage: "sources" | "drafting" | "scanning" | "verifying", status: "active" }
 *   { stage: "drafting",  status: "chunk", text }                       typewriter delta
 *   { stage: "scanning",  status: "tick", ruleId, index, total, flagged }
 *   { stage: <any of the four>, status: "complete", result, ...extra }
 *   { stage: "done", draftId, remainingToday? }
 *   { stage: "error", message }
 */

export const dynamic = "force-dynamic";

const STAGE_MS = { sources: 1200, drafting: 2500, scanning: 1000, verifying: 800 } as const;
const CHUNK_MS = 40;
const SOURCES_TOTAL = 14;
const SOURCES_MATCHED = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** Split into word groups, keeping whitespace and paragraph breaks attached. */
function chunkText(text: string, targetChunks: number): string[] {
  const tokens = text.match(/\S+\s*/g) ?? [text];
  const perChunk = Math.max(1, Math.ceil(tokens.length / targetChunks));
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += perChunk) {
    chunks.push(tokens.slice(i, i + perChunk).join(""));
  }
  return chunks;
}

function flaggedRuleIds(aiTellFlags: string | null): string[] {
  if (!aiTellFlags) return [];
  try {
    const parsed = JSON.parse(aiTellFlags) as { flags?: { ruleId: string; severity?: string }[] };
    return (parsed.flags ?? []).filter((f) => f.severity !== "info").map((f) => f.ruleId);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  if (!isDemo()) return new Response("Not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { topic?: string };
  const topic = (body.topic ?? "").trim();
  if (topic && topic.length < 3) {
    return Response.json({ error: "Topic must be at least 3 characters" }, { status: 400 });
  }
  if (topic.length > 200) {
    return Response.json({ error: "Topic must be under 200 characters" }, { status: 400 });
  }

  // Mint the real fixture-store draft first so `done` always points at something renderable.
  let draftId: string;
  let remainingToday: number | undefined;
  if (topic) {
    const result = demoDrafts.generateQuick(topic);
    if (!result) {
      return Response.json({ error: "Daily quick-generate limit reached", code: "QUICK_LIMIT" }, { status: 429 });
    }
    draftId = result.draftId;
    remainingToday = result.remainingToday;
  } else {
    draftId = demoDrafts.generateOne().draftId;
  }

  const draft = demoDrafts.list("pending", 100).drafts.find((d) => d.id === draftId);
  if (!draft) {
    return Response.json({ error: "Demo draft not found" }, { status: 500 });
  }

  const ruleIds = STATIC_QUALITY_RULES.map((r) => r.id);
  const flagged = flaggedRuleIds(draft.aiTellFlags).filter((id) => ruleIds.includes(id));
  const unsupported = flagged.includes("fact_check_unsupported_claims");
  const claimCount = Math.max(
    3,
    draft.draftText.split(/(?<=[.!?])\s+/).filter((s) => /\d/.test(s)).length,
  );

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        // 1. sources
        send({ stage: "sources", status: "active", total: SOURCES_TOTAL });
        await sleep(STAGE_MS.sources);
        send({
          stage: "sources",
          status: "complete",
          result: `${SOURCES_MATCHED} on-topic`,
          total: SOURCES_TOTAL,
          matched: SOURCES_MATCHED,
        });

        // 2. drafting: stream the fixture text so the whole stage lasts ~2.5s
        send({ stage: "drafting", status: "active" });
        const chunks = chunkText(draft.draftText, Math.round(STAGE_MS.drafting / CHUNK_MS));
        const draftStart = Date.now();
        // Pace against absolute deadlines: coarse timers (Windows ~16ms) would
        // otherwise stretch N short sleeps well past the intended stage length.
        const chunkMs = STAGE_MS.drafting / chunks.length;
        for (let i = 0; i < chunks.length; i++) {
          if (cancelled) return;
          send({ stage: "drafting", status: "chunk", text: chunks[i]! });
          await sleep(draftStart + (i + 1) * chunkMs - Date.now());
        }
        send({
          stage: "drafting",
          status: "complete",
          result: `${draft.draftText.trim().split(/\s+/).length} words`,
        });

        // 3. scanning: tick the real rule ids
        send({ stage: "scanning", status: "active", total: ruleIds.length });
        const tickMs = STAGE_MS.scanning / ruleIds.length;
        const scanStart = Date.now();
        for (let i = 0; i < ruleIds.length; i++) {
          if (cancelled) return;
          const ruleId = ruleIds[i]!;
          send({
            stage: "scanning",
            status: "tick",
            ruleId,
            index: i + 1,
            total: ruleIds.length,
            flagged: flagged.includes(ruleId),
          });
          await sleep(scanStart + (i + 1) * tickMs - Date.now());
        }
        send({
          stage: "scanning",
          status: "complete",
          result: flagged.length === 0 ? "none flagged" : `${flagged.length} flagged`,
          total: ruleIds.length,
          flagged,
        });

        // 4. verifying
        send({ stage: "verifying", status: "active", claims: claimCount });
        await sleep(STAGE_MS.verifying);
        send({
          stage: "verifying",
          status: "complete",
          result: unsupported ? "1 needs review" : `${claimCount} of ${claimCount} grounded`,
          claims: claimCount,
        });

        send({ stage: "done", draftId, ...(remainingToday !== undefined ? { remainingToday } : {}) });
      } catch {
        send({ stage: "error", message: "Generation stream failed" });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
