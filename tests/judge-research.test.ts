import { describe, expect, it, vi } from "vitest";
import {
  JUDGE_RELEVANCE_THRESHOLD,
  judgeResearchForUser,
  type JudgeCandidate,
  type JudgeUserTopic,
} from "@/lib/ai/judge-research";

const candidates: JudgeCandidate[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "AI Agents Need A Boss",
    summary: "On supervising agentic AI workflows in production.",
    published_at: "2026-05-02T00:00:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "LIV Golf Loses Saudi Funding",
    summary: "Off-topic sports news.",
    published_at: "2026-05-01T00:00:00Z",
  },
];

const userTopics: JudgeUserTopic[] = [
  { id: "topic-a", topic_label: "AI Agents", tavily_query: "agentic ai" },
  { id: "topic-b", topic_label: "LLM Engineering", tavily_query: "llm engineering" },
];

function fakeAnthropic(textOutput: string) {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: textOutput }],
      })),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function throwingAnthropic(err: Error) {
  return {
    messages: {
      create: vi.fn(async () => {
        throw err;
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

describe("judgeResearchForUser", () => {
  it("parses well-formed JSON and returns clamped relevance values", async () => {
    const client = fakeAnthropic(
      JSON.stringify({
        verdicts: [
          { research_item_id: candidates[0].id, relevance: 0.92, matched_topic_id: "topic-a", reason: "direct match" },
          { research_item_id: candidates[1].id, relevance: 0.05, matched_topic_id: null, reason: "off-topic" },
        ],
      }),
    );
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0].relevance).toBeCloseTo(0.92);
    expect(result.verdicts[0].matched_topic_id).toBe("topic-a");
    expect(result.verdicts[1].relevance).toBeCloseTo(0.05);
    expect(result.verdicts[1].matched_topic_id).toBeNull();
  });

  it("strips markdown fences before parsing", async () => {
    const client = fakeAnthropic(
      "```json\n" +
        JSON.stringify({
          verdicts: [
            { research_item_id: candidates[0].id, relevance: 0.7, matched_topic_id: "topic-a", reason: "ok" },
          ],
        }) +
        "\n```",
    );
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdicts[0].relevance).toBeCloseTo(0.7);
  });

  it("clamps out-of-range relevance into [0, 1]", async () => {
    const client = fakeAnthropic(
      JSON.stringify({
        verdicts: [
          { research_item_id: candidates[0].id, relevance: 1.7, matched_topic_id: "topic-a", reason: "" },
          { research_item_id: candidates[1].id, relevance: -0.5, matched_topic_id: null, reason: "" },
        ],
      }),
    );
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    if (!result.ok) throw new Error("expected ok");
    expect(result.verdicts[0].relevance).toBe(1);
    expect(result.verdicts[1].relevance).toBe(0);
  });

  it("drops verdicts whose research_item_id is unknown", async () => {
    const client = fakeAnthropic(
      JSON.stringify({
        verdicts: [
          { research_item_id: "not-a-real-id", relevance: 0.9, matched_topic_id: "topic-a", reason: "" },
          { research_item_id: candidates[0].id, relevance: 0.8, matched_topic_id: "topic-a", reason: "" },
        ],
      }),
    );
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    if (!result.ok) throw new Error("expected ok");
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0].research_item_id).toBe(candidates[0].id);
  });

  it("nullifies matched_topic_id if the judge returned an unknown topic id", async () => {
    const client = fakeAnthropic(
      JSON.stringify({
        verdicts: [
          { research_item_id: candidates[0].id, relevance: 0.9, matched_topic_id: "ghost-topic", reason: "" },
        ],
      }),
    );
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    if (!result.ok) throw new Error("expected ok");
    expect(result.verdicts[0].matched_topic_id).toBeNull();
  });

  it("falls back with judge_error reason when the SDK throws", async () => {
    const client = throwingAnthropic(new Error("network down"));
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/^judge_error:network down/);
  });

  it("falls back with judge_parse_failed when the SDK returns non-JSON", async () => {
    const client = fakeAnthropic("hello, I am not JSON");
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("judge_parse_failed");
  });

  it("falls back with judge_response_missing_verdicts_array when shape is wrong", async () => {
    const client = fakeAnthropic(JSON.stringify({ scores: [] }));
    const result = await judgeResearchForUser({ candidates, userTopics }, { client });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("judge_response_missing_verdicts_array");
  });

  it("returns timeout reason when the abort fires before the SDK resolves", async () => {
    const slowClient = {
      messages: {
        create: vi.fn(
          (_args: unknown, opts: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
            }),
        ),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    const result = await judgeResearchForUser({ candidates, userTopics }, { client: slowClient, timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("judge_timeout");
  });

  it("short-circuits with empty verdicts if there are no candidates or no topics", async () => {
    const client = fakeAnthropic("{}");
    const r1 = await judgeResearchForUser({ candidates: [], userTopics }, { client });
    const r2 = await judgeResearchForUser({ candidates, userTopics: [] }, { client });
    expect(r1.ok && r1.verdicts).toEqual([]);
    expect(r2.ok && r2.verdicts).toEqual([]);
  });

  it("exports a 0.4 relevance threshold constant", () => {
    expect(JUDGE_RELEVANCE_THRESHOLD).toBe(0.4);
  });
});
