import { describe, expect, it } from "vitest";
import {
  getMatchedPriorityWeight,
  getPriorityAdjustedScore,
  getPriorityMultiplier,
  selectProjectMultiplierFromWeights,
} from "@/lib/ai/rank-research";

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

describe("getMatchedPriorityWeight (Phase 2 bug fix)", () => {
  const item = { title: "AI agents in autonomous driving", summary: "A long-form take." };

  it("returns 3 (default) when no topic matches", () => {
    const out = getMatchedPriorityWeight({
      ...item,
      linkedTopics: [{ topicLabel: "knitting patterns", priorityWeight: 5 }],
    });
    expect(out).toBe(3);
  });

  it("priority 1 is reachable on a single match (regression: was 3 before fix)", () => {
    const out = getMatchedPriorityWeight({
      ...item,
      linkedTopics: [{ topicLabel: "agents", priorityWeight: 1 }],
    });
    expect(out).toBe(1);
  });

  it("priority 2 is reachable on a single match (regression: was 3 before fix)", () => {
    const out = getMatchedPriorityWeight({
      ...item,
      linkedTopics: [{ topicLabel: "agents", priorityWeight: 2 }],
    });
    expect(out).toBe(2);
  });

  it("returns the maximum across multiple matching topics", () => {
    const out = getMatchedPriorityWeight({
      ...item,
      linkedTopics: [
        { topicLabel: "agents", priorityWeight: 2 },
        { topicLabel: "autonomous driving", priorityWeight: 5 },
        { topicLabel: "ai", priorityWeight: 4 },
      ],
    });
    expect(out).toBe(5);
  });

  it("non-matching topics do not raise the floor", () => {
    // If a non-matching priority-5 topic existed and the only matching topic is priority 1,
    // the result must be 1 (the matching topic's weight), not 3 or 5.
    const out = getMatchedPriorityWeight({
      ...item,
      linkedTopics: [
        { topicLabel: "knitting", priorityWeight: 5 },
        { topicLabel: "agents", priorityWeight: 1 },
      ],
    });
    expect(out).toBe(1);
  });
});

describe("selectProjectMultiplierFromWeights (computeProjectMultiplier core)", () => {
  it("returns 1.0 when topic is in no projects (empty weight list)", () => {
    expect(selectProjectMultiplierFromWeights([])).toBe(1.0);
  });

  it("returns the multiplier for the only weight when topic is in one project", () => {
    expect(selectProjectMultiplierFromWeights([5])).toBe(1.5);
    expect(selectProjectMultiplierFromWeights([1])).toBe(0.6);
    expect(selectProjectMultiplierFromWeights([3])).toBe(1.0);
  });

  it("max wins across multiple weights (one project listing the topic multiple times)", () => {
    expect(selectProjectMultiplierFromWeights([1, 4, 2])).toBe(getPriorityMultiplier(4));
  });

  it("max wins across two projects each containing the topic", () => {
    expect(selectProjectMultiplierFromWeights([2, 5])).toBe(1.5);
  });

  it("ignores nullish entries (defensive)", () => {
    expect(selectProjectMultiplierFromWeights([null, undefined, 4])).toBe(getPriorityMultiplier(4));
    expect(selectProjectMultiplierFromWeights([null, undefined])).toBe(1.0);
  });
});
