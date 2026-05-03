import { describe, expect, it } from "vitest";
import { getPriorityAdjustedScore, getPriorityMultiplier } from "@/lib/ai/rank-research";

describe("getPriorityMultiplier", () => {
  it.each([
    [1, 0.6],
    [2, 0.8],
    [3, 1.0],
    [4, 1.2],
    [5, 1.5],
  ])("weight %i → multiplier %f", (weight, expected) => {
    expect(getPriorityMultiplier(weight)).toBe(expected);
  });

  it("treats null/undefined as default weight 3 (multiplier 1.0)", () => {
    expect(getPriorityMultiplier(null)).toBe(1.0);
    expect(getPriorityMultiplier(undefined)).toBe(1.0);
  });

  it("falls back to 1.0 for out-of-range weights", () => {
    expect(getPriorityMultiplier(0)).toBe(1.0);
    expect(getPriorityMultiplier(99)).toBe(1.0);
  });
});

describe("getPriorityAdjustedScore", () => {
  it("computes (relevance + originality) * multiplier", () => {
    expect(
      getPriorityAdjustedScore({ relevanceScore: 0.8, originalityScore: 0.4, topicPriorityWeight: 5 }),
    ).toBeCloseTo(1.8);
    expect(
      getPriorityAdjustedScore({ relevanceScore: 0.8, originalityScore: 0.4, topicPriorityWeight: 1 }),
    ).toBeCloseTo(0.72);
  });

  it("treats nulls as zeros for scores and 1.0 for missing weight", () => {
    expect(getPriorityAdjustedScore({ relevanceScore: null, originalityScore: null, topicPriorityWeight: null })).toBe(
      0,
    );
  });

  it("priority 5 beats priority 1 at equal raw relevance/originality", () => {
    const high = getPriorityAdjustedScore({ relevanceScore: 0.7, originalityScore: 0.5, topicPriorityWeight: 5 });
    const low = getPriorityAdjustedScore({ relevanceScore: 0.7, originalityScore: 0.5, topicPriorityWeight: 1 });
    expect(high).toBeGreaterThan(low);
  });
});
