const PRIORITY_MULTIPLIERS: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.2,
  5: 1.5,
};

export function getPriorityMultiplier(weight: number | null | undefined): number {
  const safeWeight = weight ?? 3;
  return PRIORITY_MULTIPLIERS[safeWeight] ?? 1.0;
}

export function getPriorityAdjustedScore(input: {
  relevanceScore: number | null | undefined;
  originalityScore: number | null | undefined;
  topicPriorityWeight: number | null | undefined;
}): number {
  const base = (input.relevanceScore ?? 0) + (input.originalityScore ?? 0);
  return base * getPriorityMultiplier(input.topicPriorityWeight);
}

