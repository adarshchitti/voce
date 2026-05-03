import { describe, expect, it } from "vitest";
import { rankPerUserCandidates, type PerUserCandidateRankInput } from "@/lib/ai/rank-research";

type C = PerUserCandidateRankInput & { id: string; sourceTopicLabel: string };

const candidates: C[] = [
  // High originality, low-priority topic, no project
  { id: "A", sourceTopicId: "topic-low", sourceTopicLabel: "Low priority topic", userTopicWeight: 1, originality: 0.9 },
  // Mid originality, default-priority topic, no project
  { id: "B", sourceTopicId: "topic-default", sourceTopicLabel: "Default priority topic", userTopicWeight: 3, originality: 0.6 },
  // Mid originality, high-priority topic, project boost
  { id: "C", sourceTopicId: "topic-high", sourceTopicLabel: "High priority topic", userTopicWeight: 5, originality: 0.6 },
  // Low originality, default topic, project at priority 5
  { id: "D", sourceTopicId: "topic-projectified", sourceTopicLabel: "Has project", userTopicWeight: 3, originality: 0.4 },
];

describe("rankPerUserCandidates (Phase 2 ranking math)", () => {
  it("composes user-topic and project multipliers and sorts desc by finalScore", () => {
    const projectMultipliers = new Map([
      // Only one topic has a project; others fall back to 1.0
      ["topic-projectified", 1.5],
    ]);
    const ranked = rankPerUserCandidates(candidates, projectMultipliers);

    // Expected finalScores:
    //   A: 0.9 × 0.6 × 1.0 = 0.54
    //   B: 0.6 × 1.0 × 1.0 = 0.6
    //   C: 0.6 × 1.5 × 1.0 = 0.9
    //   D: 0.4 × 1.0 × 1.5 = 0.6000000000000001  (IEEE 754 rounding)
    // The float drift puts D just above B even though both are nominally 0.6.
    // That's the production behaviour and is invisible to users; the test
    // documents it rather than fights it.
    expect(ranked.map((r) => r.id)).toEqual(["C", "D", "B", "A"]);
    expect(ranked[0].finalScore).toBeCloseTo(0.9);
    expect(ranked[1].finalScore).toBeCloseTo(0.6);
    expect(ranked[2].finalScore).toBeCloseTo(0.6);
    expect(ranked[3].finalScore).toBeCloseTo(0.54);
  });

  it("falls back to 1.0 project multiplier when topic id has no entry in the map", () => {
    const ranked = rankPerUserCandidates(
      [{ id: "X", sourceTopicId: "unknown", sourceTopicLabel: "X", userTopicWeight: 3, originality: 0.5 }],
      new Map(),
    );
    expect(ranked[0].projectMultiplier).toBe(1.0);
    expect(ranked[0].finalScore).toBeCloseTo(0.5);
  });

  it("compound boost: priority-5 user topic + priority-5 project beats priority-3+1.0", () => {
    const ranked = rankPerUserCandidates(
      [
        { id: "boosted", sourceTopicId: "t1", sourceTopicLabel: "t1", userTopicWeight: 5, originality: 0.5 },
        { id: "plain", sourceTopicId: "t2", sourceTopicLabel: "t2", userTopicWeight: 3, originality: 0.5 },
      ],
      new Map([["t1", 1.5]]),
    );
    // boosted: 0.5 × 1.5 × 1.5 = 1.125
    // plain:   0.5 × 1.0 × 1.0 = 0.5
    expect(ranked[0].id).toBe("boosted");
    expect(ranked[0].finalScore).toBeCloseTo(1.125);
  });

  it("compound penalty: priority-1 user topic + priority-1 project drops below default", () => {
    const ranked = rankPerUserCandidates(
      [
        { id: "penalised", sourceTopicId: "t1", sourceTopicLabel: "t1", userTopicWeight: 1, originality: 0.7 },
        { id: "default", sourceTopicId: "t2", sourceTopicLabel: "t2", userTopicWeight: 3, originality: 0.5 },
      ],
      new Map([["t1", 0.6]]),
    );
    // penalised: 0.7 × 0.6 × 0.6 = 0.252
    // default:   0.5 × 1.0 × 1.0 = 0.5
    expect(ranked[0].id).toBe("default");
    expect(ranked[1].finalScore).toBeCloseTo(0.252);
  });

  it("preserves source_topic_label and other passthrough fields on ranked items (draft attribution)", () => {
    const ranked = rankPerUserCandidates(
      [{ id: "X", sourceTopicId: "t", sourceTopicLabel: "Lovely Topic", userTopicWeight: 4, originality: 0.5 }],
      new Map(),
    );
    expect(ranked[0].sourceTopicLabel).toBe("Lovely Topic");
    expect(ranked[0].id).toBe("X");
    expect(ranked[0].sourceTopicId).toBe("t");
  });

  it("top-N selection: caller slices the sorted array", () => {
    const ranked = rankPerUserCandidates(candidates, new Map([["topic-projectified", 1.5]]));
    const top2 = ranked.slice(0, 2);
    // Per the previous test's float-rounding note, D edges B for second.
    expect(top2.map((r) => r.id)).toEqual(["C", "D"]);
  });

  it("handles empty input cleanly", () => {
    expect(rankPerUserCandidates([], new Map())).toEqual([]);
  });

  it("uses 0.5 originality placeholder semantics correctly when callers pass 0.5", () => {
    // Per the Phase 2 plan, Tavily-fetched items without an originality score
    // get 0.5 as a placeholder. Verify the math still produces sensible
    // ordering when most items share that placeholder.
    const ranked = rankPerUserCandidates(
      [
        { id: "tav-low", sourceTopicId: "low", sourceTopicLabel: "low", userTopicWeight: 1, originality: 0.5 },
        { id: "tav-mid", sourceTopicId: "mid", sourceTopicLabel: "mid", userTopicWeight: 3, originality: 0.5 },
        { id: "tav-high", sourceTopicId: "high", sourceTopicLabel: "high", userTopicWeight: 5, originality: 0.5 },
      ],
      new Map(),
    );
    // All same originality (0.5), only user-topic weight differs.
    // tav-high: 0.5 × 1.5 = 0.75 (top)
    // tav-mid:  0.5 × 1.0 = 0.50
    // tav-low:  0.5 × 0.6 = 0.30
    expect(ranked.map((r) => r.id)).toEqual(["tav-high", "tav-mid", "tav-low"]);
  });
});
