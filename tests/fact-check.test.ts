import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock the Anthropic SDK at the module level so verifyFactualClaims
// exercises its real parsing/error paths but never makes a network call.
const messagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = { create: messagesCreate };
    },
  };
});

import { verifyFactualClaims, __testing } from "@/lib/ai/fact-check";

const SOURCE = {
  title: "MIT consensus paper",
  url: "https://example.com/paper",
  content: "Researchers at MIT propose a new consensus protocol with significant latency improvements.",
};

beforeEach(() => {
  messagesCreate.mockReset();
});

afterEach(() => {
  messagesCreate.mockReset();
});

describe("verifyFactualClaims", () => {
  it("returns no flag when source is null", async () => {
    const result = await verifyFactualClaims("Some draft text.", null);
    expect(result.attempted).toBe(false);
    expect(result.flag).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns no flag when source content is empty", async () => {
    const result = await verifyFactualClaims("Some draft text.", { ...SOURCE, content: "" });
    expect(result.attempted).toBe(false);
    expect(result.flag).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns null flag when verifier reports all claims supported", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"unsupported_claims":[]}' }],
    });
    const result = await verifyFactualClaims("Draft mentioning MIT consensus protocol.", SOURCE);
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.unsupportedClaimCount).toBe(0);
    expect(result.flag).toBeNull();
  });

  it("returns a structural flag with formatted details when claims are unsupported", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            unsupported_claims: [
              { claim: "23% error propagation rate", kind: "number", source_says: "not in source" },
              {
                claim: "I've been tracking agent research",
                kind: "first_person",
                source_says: "not in source",
              },
            ],
          }),
        },
      ],
    });
    const result = await verifyFactualClaims("Some draft text.", SOURCE);
    expect(result.succeeded).toBe(true);
    expect(result.unsupportedClaimCount).toBe(2);
    expect(result.flag).not.toBeNull();
    expect(result.flag!.ruleId).toBe("fact_check_unsupported_claims");
    expect(result.flag!.action).toBe("flag");
    expect(result.flag!.category).toBe("structural");
    expect(result.flag!.details).toContain("23% error propagation rate");
    expect(result.flag!.details).toContain("I've been tracking agent research");
    expect(result.flag!.details).toContain("Source says: not in source");
    expect(result.flag!.details).toContain(" | "); // claim separator
  });

  it("strips markdown code fences before parsing", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```json\n{"unsupported_claims":[{"claim":"X","kind":"entity","source_says":"not in source"}]}\n```',
        },
      ],
    });
    const result = await verifyFactualClaims("Draft.", SOURCE);
    expect(result.succeeded).toBe(true);
    expect(result.unsupportedClaimCount).toBe(1);
    expect(result.flag!.details).toContain("'X'");
  });

  it("returns null flag (fail-open) on malformed JSON response", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json at all {" }],
    });
    const result = await verifyFactualClaims("Draft.", SOURCE);
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.flag).toBeNull();
  });

  it("returns null flag (fail-open) when SDK throws", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("network failed"));
    const result = await verifyFactualClaims("Draft.", SOURCE);
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.flag).toBeNull();
  });

  it("returns null flag (fail-open) on AbortError simulating timeout", async () => {
    const abortErr = new Error("Request was aborted");
    abortErr.name = "AbortError";
    messagesCreate.mockRejectedValueOnce(abortErr);
    const result = await verifyFactualClaims("Draft.", SOURCE);
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.flag).toBeNull();
  });

  it("treats non-text content blocks as a failure (fail-open)", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "image", source: { data: "..." } }],
    });
    const result = await verifyFactualClaims("Draft.", SOURCE);
    expect(result.succeeded).toBe(false);
    expect(result.flag).toBeNull();
  });
});

describe("parseVerifierResponse (internal)", () => {
  it("rejects responses without unsupported_claims field", () => {
    expect(__testing.parseVerifierResponse('{"foo":"bar"}')).toBeNull();
  });
  it("rejects responses where unsupported_claims is not an array", () => {
    expect(__testing.parseVerifierResponse('{"unsupported_claims":"oops"}')).toBeNull();
  });
});

describe("formatClaimsDetails (internal)", () => {
  it("joins claims with pipe separators and includes source-says", () => {
    const out = __testing.formatClaimsDetails([
      { claim: "X", kind: "number", source_says: "not in source" },
      { claim: "Y", kind: "entity", source_says: "the paper says Z" },
    ]);
    expect(out).toBe("Claim: 'X'. Source says: not in source. | Claim: 'Y'. Source says: the paper says Z.");
  });
});
