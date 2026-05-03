import { describe, expect, it } from "vitest";
import {
  rankJudgedCandidates,
  type JudgeRunResult,
  type RankableCandidate,
  type RankableTopic,
} from "@/lib/ai/judge-research";

const candidates: RankableCandidate[] = [
  { id: "item-A", relevanceScore: "0.7", originalityScore: "0.3" },
  { id: "item-B", relevanceScore: "0.6", originalityScore: "0.5" },
  { id: "item-C", relevanceScore: "0.9", originalityScore: "0.8" },
];

const topicsById = new Map<string, RankableTopic>([
  ["topic-high", { id: "topic-high", priorityWeight: 5 }],
  ["topic-low", { id: "topic-low", priorityWeight: 1 }],
  ["topic-default", { id: "topic-default", priorityWeight: 3 }],
]);

function judgeOk(verdicts: Array<{ id: string; relevance: number; topicId: string | null }>): JudgeRunResult {
  return {
    ok: true,
    durationMs: 50,
    verdicts: verdicts.map((v) => ({
      research_item_id: v.id,
      relevance: v.relevance,
      matched_topic_id: v.topicId,
      reason: "test",
    })),
  };
}

describe("rankJudgedCandidates", () => {
  it("excludes candidates whose raw relevance is below the 0.4 threshold", () => {
    const judged = judgeOk([
      { id: "item-A", relevance: 0.39, topicId: "topic-default" },
      { id: "item-B", relevance: 0.4, topicId: "topic-default" },
      { id: "item-C", relevance: 0.85, topicId: "topic-default" },
    ]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    const ids = ranked.map((r) => r.item.id);
    expect(ids).toEqual(["item-C", "item-B"]);
    expect(ids).not.toContain("item-A");
  });

  it("priority 5 wins over priority 1 at similar raw relevance (the core ordering invariant)", () => {
    const judged = judgeOk([
      { id: "item-A", relevance: 0.7, topicId: "topic-low" },
      { id: "item-B", relevance: 0.7, topicId: "topic-high" },
    ]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked[0].item.id).toBe("item-B");
    expect(ranked[0].finalScore).toBeCloseTo(0.7 * 1.5);
    expect(ranked[1].item.id).toBe("item-A");
    expect(ranked[1].finalScore).toBeCloseTo(0.7 * 0.6);
  });

  it("uses multiplier 1.0 when matched_topic_id is null (no boost, no penalty)", () => {
    const judged = judgeOk([{ id: "item-A", relevance: 0.7, topicId: null }]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].finalScore).toBeCloseTo(0.7);
    expect(ranked[0].matchedTopicId).toBeNull();
  });

  it("does NOT priority-penalize a low-priority topic into oblivion (threshold is on raw relevance)", () => {
    // A priority-1 topic at relevance 0.5 should still pass the threshold,
    // even though its final_score (0.5 * 0.6 = 0.30) drops below the literal threshold.
    const judged = judgeOk([{ id: "item-A", relevance: 0.5, topicId: "topic-low" }]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].finalScore).toBeCloseTo(0.3);
  });

  it("zero-pass scenario: every candidate below threshold yields empty ranking", () => {
    const judged = judgeOk([
      { id: "item-A", relevance: 0.1, topicId: "topic-default" },
      { id: "item-B", relevance: 0.2, topicId: "topic-default" },
      { id: "item-C", relevance: 0.39, topicId: "topic-default" },
    ]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked).toEqual([]);
  });

  it("falls back to global (relevance + originality) order when judgeOutcome.ok is false", () => {
    const judged: JudgeRunResult = { ok: false, reason: "judge_timeout", durationMs: 8000 };
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    // item-C: 0.9 + 0.8 = 1.7 → first
    // item-B: 0.6 + 0.5 = 1.1 → second
    // item-A: 0.7 + 0.3 = 1.0 → third
    expect(ranked.map((r) => r.item.id)).toEqual(["item-C", "item-B", "item-A"]);
    for (const r of ranked) {
      expect(r.matchedTopicId).toBeNull();
      expect(r.judgeReason).toBe("fallback:global_score_order");
    }
  });

  it("ignores verdicts that reference unknown candidate ids", () => {
    const judged = judgeOk([
      { id: "ghost", relevance: 0.99, topicId: "topic-high" },
      { id: "item-A", relevance: 0.7, topicId: "topic-default" },
    ]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked.map((r) => r.item.id)).toEqual(["item-A"]);
  });

  it("uses multiplier 1.0 when matched_topic_id references an unknown topic", () => {
    const judged = judgeOk([{ id: "item-A", relevance: 0.7, topicId: "topic-deleted" }]);
    const ranked = rankJudgedCandidates({ candidates, topicsById, judgeOutcome: judged });
    expect(ranked[0].finalScore).toBeCloseTo(0.7);
  });
});
