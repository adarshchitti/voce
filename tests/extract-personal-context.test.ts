import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { create: messagesCreate };
  },
}));

import { extractPersonalContextComponents, __testing } from "@/lib/ai/extract-personal-context";

beforeEach(() => {
  messagesCreate.mockReset();
});
afterEach(() => {
  messagesCreate.mockReset();
});

describe("extractPersonalContextComponents", () => {
  it("returns empty for empty input without an SDK call", async () => {
    const result = await extractPersonalContextComponents("");
    expect(result.components).toEqual([]);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns empty for whitespace input without an SDK call", async () => {
    const result = await extractPersonalContextComponents("   \n   ");
    expect(result.components).toEqual([]);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns parsed components from a valid Haiku response", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            components: [
              "shipped 3 RAG systems at a B2B startup in 2024",
              "ran an NLP research lab focused on retrieval at university",
            ],
          }),
        },
      ],
    });
    const result = await extractPersonalContextComponents("Some background text.");
    expect(result.components).toHaveLength(2);
    expect(result.components[0]).toContain("RAG systems");
  });

  it("strips markdown code fences before parsing", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```json\n{"components":["one specific thing"]}\n```',
        },
      ],
    });
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual(["one specific thing"]);
  });

  it("returns empty when Haiku returns vague-text empty array (graceful low-quality input)", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"components":[]}' }],
    });
    const result = await extractPersonalContextComponents("I'm in tech and like AI");
    expect(result.components).toEqual([]);
  });

  it("returns empty (fail-open) on malformed JSON", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "definitely not json {" }],
    });
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual([]);
  });

  it("returns empty (fail-open) when SDK throws", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("network error"));
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual([]);
  });

  it("returns empty (fail-open) on AbortError simulating timeout", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    messagesCreate.mockRejectedValueOnce(abort);
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual([]);
  });

  it("filters non-string and empty entries from the components array", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            components: ["valid one", "", "  ", 42, null, "valid two"],
          }),
        },
      ],
    });
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual(["valid one", "valid two"]);
  });

  it("returns empty when Haiku response shape is wrong (no components field)", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"items":["one"]}' }],
    });
    const result = await extractPersonalContextComponents("text");
    expect(result.components).toEqual([]);
  });
});

describe("parseExtractionResponse (internal)", () => {
  it("rejects responses where components is not an array", () => {
    expect(__testing.parseExtractionResponse('{"components":"oops"}')).toBeNull();
  });

  it("trims whitespace from individual components", () => {
    const out = __testing.parseExtractionResponse('{"components":["  trimmed  "]}');
    expect(out).not.toBeNull();
    expect(out!.components).toEqual(["trimmed"]);
  });
});

describe("buildExtractionPrompt (internal)", () => {
  it("includes the rawText verbatim", () => {
    const prompt = __testing.buildExtractionPrompt("I worked at MIT on consensus.");
    expect(prompt).toContain("I worked at MIT on consensus.");
    expect(prompt).toContain("Quality over quantity.");
  });
});
