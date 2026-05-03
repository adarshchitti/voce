import Anthropic from "@anthropic-ai/sdk";
import { getPriorityMultiplier } from "@/lib/ai/rank-research";

export const JUDGE_RELEVANCE_THRESHOLD = 0.4;
export const JUDGE_TIMEOUT_MS = 30000;
export const JUDGE_MODEL = "claude-haiku-4-5-20251001";

export type JudgeCandidate = {
  id: string;
  title: string;
  summary: string;
  published_at: string;
};

export type JudgeUserTopic = {
  id: string;
  topic_label: string;
  tavily_query: string;
};

export type JudgeVerdict = {
  research_item_id: string;
  relevance: number;
  matched_topic_id: string | null;
  reason: string;
};

export type JudgeRunResult =
  | { ok: true; verdicts: JudgeVerdict[]; durationMs: number }
  | { ok: false; reason: string; durationMs: number };

export type RankableCandidate = {
  id: string;
  relevanceScore?: string | number | null;
  originalityScore?: string | number | null;
};

export type RankableTopic = {
  id: string;
  priorityWeight?: number | null;
};

export type RankedCandidate<T extends RankableCandidate> = {
  item: T;
  relevance: number;
  matchedTopicId: string | null;
  judgeReason: string;
  finalScore: number;
};

/**
 * Pure ranking step shared by the daily-cron pipeline. Applies the judge
 * threshold + priority-weight multiplier on the happy path; falls back to
 * deterministic global score ordering when the judge returned !ok.
 *
 * Sort is descending by finalScore; ties are stable.
 */
export function rankJudgedCandidates<T extends RankableCandidate>(input: {
  candidates: T[];
  topicsById: Map<string, RankableTopic>;
  judgeOutcome: JudgeRunResult;
  threshold?: number;
}): RankedCandidate<T>[] {
  const threshold = input.threshold ?? JUDGE_RELEVANCE_THRESHOLD;
  const ranked: RankedCandidate<T>[] = [];

  if (input.judgeOutcome.ok) {
    const verdictsById = new Map<string, JudgeVerdict>();
    for (const v of input.judgeOutcome.verdicts) verdictsById.set(v.research_item_id, v);
    for (const item of input.candidates) {
      const verdict = verdictsById.get(item.id);
      if (!verdict) continue;
      if (verdict.relevance < threshold) continue;
      const topic = verdict.matched_topic_id ? input.topicsById.get(verdict.matched_topic_id) : undefined;
      const multiplier = getPriorityMultiplier(topic?.priorityWeight);
      ranked.push({
        item,
        relevance: verdict.relevance,
        matchedTopicId: verdict.matched_topic_id,
        judgeReason: verdict.reason,
        finalScore: verdict.relevance * multiplier,
      });
    }
  } else {
    for (const item of input.candidates) {
      const rel = Number(item.relevanceScore ?? 0);
      const orig = Number(item.originalityScore ?? 0);
      ranked.push({
        item,
        relevance: rel,
        matchedTopicId: null,
        judgeReason: "fallback:global_score_order",
        finalScore: rel + orig,
      });
    }
  }

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked;
}

function getClient(client?: Anthropic): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

function clampRelevance(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildPrompt(input: { candidates: JudgeCandidate[]; userTopics: JudgeUserTopic[] }): string {
  const topicsBlock = input.userTopics
    .map((t) => `- id: ${t.id} | label: ${t.topic_label} | query: ${t.tavily_query}`)
    .join("\n");
  const candidatesBlock = input.candidates
    .map(
      (c) =>
        `- id: ${c.id}
  title: ${c.title}
  published_at: ${c.published_at}
  summary: ${c.summary}`,
    )
    .join("\n");
  return `You are scoring research items for a LinkedIn content creator.
The creator subscribes to these topics:
${topicsBlock}

For each research item below, return:
- research_item_id: the id you were given
- relevance: 0.0 to 1.0 — how well does this item match ANY of the topics above?
  1.0 = directly about one of the topics with a fresh angle
  0.7 = clearly related to a topic
  0.4 = adjacent / loosely related
  0.0 = unrelated
- matched_topic_id: the id of the single best-matching topic, or null if no topic matches well (relevance < 0.4)
- reason: one short sentence explaining the score

Return JSON only, no preamble, no markdown fences. Shape:
{ "verdicts": [{ "research_item_id": "...", "relevance": 0.0, "matched_topic_id": "..." | null, "reason": "..." }] }

Items to score:
${candidatesBlock}`;
}

export async function judgeResearchForUser(
  input: {
    candidates: JudgeCandidate[];
    userTopics: JudgeUserTopic[];
  },
  options: {
    client?: Anthropic;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<JudgeRunResult> {
  const start = Date.now();
  if (input.candidates.length === 0 || input.userTopics.length === 0) {
    return { ok: true, verdicts: [], durationMs: 0 };
  }

  const client = getClient(options.client);
  const timeoutMs = options.timeoutMs ?? JUDGE_TIMEOUT_MS;

  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const prompt = buildPrompt(input);
  // Allow ~120 tokens per candidate worst-case (id + relevance + topic id + short reason).
  const maxTokens = Math.max(800, input.candidates.length * 140);

  try {
    const response = await client.messages.create(
      {
        model: JUDGE_MODEL,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(clean) as { verdicts?: Array<Record<string, unknown>> };
    const rawVerdicts = parsed.verdicts;
    if (!Array.isArray(rawVerdicts)) {
      return { ok: false, reason: "judge_response_missing_verdicts_array", durationMs: Date.now() - start };
    }
    const candidateIds = new Set(input.candidates.map((c) => c.id));
    const topicIds = new Set(input.userTopics.map((t) => t.id));
    const verdicts: JudgeVerdict[] = [];
    for (const v of rawVerdicts) {
      const id = typeof v.research_item_id === "string" ? v.research_item_id : null;
      if (!id || !candidateIds.has(id)) continue;
      const matchedRaw = v.matched_topic_id;
      const matched =
        typeof matchedRaw === "string" && topicIds.has(matchedRaw) ? matchedRaw : null;
      const reason = typeof v.reason === "string" ? v.reason : "";
      verdicts.push({
        research_item_id: id,
        relevance: clampRelevance(v.relevance),
        matched_topic_id: matched,
        reason,
      });
    }
    return { ok: true, verdicts, durationMs: Date.now() - start };
  } catch (err) {
    const isAbort = controller.signal.aborted;
    const reason = isAbort
      ? "judge_timeout"
      : err instanceof SyntaxError
        ? "judge_parse_failed"
        : err instanceof Error
          ? `judge_error:${err.message.slice(0, 120)}`
          : "judge_error_unknown";
    return { ok: false, reason, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}
