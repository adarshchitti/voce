import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { create: messagesCreate };
  },
}));

import { selectPersonalContextForDraft, __testing } from "@/lib/ai/select-personal-context";

const COMPONENTS = [
  "shipped 3 RAG systems at a B2B startup in 2024",
  "led an NLP research lab focused on retrieval",
  "wrote a paper on distributed consensus that got 500 citations",
];

beforeEach(() => {
  messagesCreate.mockReset();
});
afterEach(() => {
  messagesCreate.mockReset();
});

describe("selectPersonalContextForDraft", () => {
  it("returns null when components list is empty (no SDK call)", async () => {
    const result = await selectPersonalContextForDraft("Some draft about RAG.", []);
    expect(result.selectedIndex).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns null for empty draft text (no SDK call)", async () => {
    const result = await selectPersonalContextForDraft("", COMPONENTS);
    expect(result.selectedIndex).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 0-based index when Haiku selects a component", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            selected_entry_number: 1,
            rationale: "RAG fits the draft topic exactly.",
          }),
        },
      ],
    });
    const result = await selectPersonalContextForDraft("Draft about RAG systems.", COMPONENTS);
    expect(result.selectedIndex).toBe(0);
    expect(result.rationale).toContain("RAG");
  });

  it("returns null when Haiku says no fit", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            selected_entry_number: null,
            rationale: "None of the experiences fit a marketing topic.",
          }),
        },
      ],
    });
    const result = await selectPersonalContextForDraft("Draft about marketing.", COMPONENTS);
    expect(result.selectedIndex).toBeNull();
    expect(result.rationale).toContain("None");
  });

  it("returns null (fail-open) when Haiku returns malformed JSON", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json" }],
    });
    const result = await selectPersonalContextForDraft("Draft.", COMPONENTS);
    expect(result.selectedIndex).toBeNull();
  });

  it("returns null (fail-open) when SDK throws", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("network"));
    const result = await selectPersonalContextForDraft("Draft.", COMPONENTS);
    expect(result.selectedIndex).toBeNull();
  });

  it("clamps an out-of-range selection number to null", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ selected_entry_number: 99, rationale: "weird response" }),
        },
      ],
    });
    const result = await selectPersonalContextForDraft("Draft.", COMPONENTS);
    expect(result.selectedIndex).toBeNull();
  });

  it("strips markdown fences before parsing", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```json\n{"selected_entry_number":2,"rationale":"x"}\n```',
        },
      ],
    });
    const result = await selectPersonalContextForDraft("Draft.", COMPONENTS);
    expect(result.selectedIndex).toBe(1);
  });
});

describe("parseSelectionResponse (internal)", () => {
  it("returns null on bad shape", () => {
    expect(__testing.parseSelectionResponse('{"foo":1}', 3)).toEqual({
      selectedIndex: null,
      rationale: null,
    });
  });
  it("rejects non-integer selection numbers", () => {
    expect(__testing.parseSelectionResponse('{"selected_entry_number":1.5}', 3)).toBeNull();
  });
});

describe("buildSelectionPrompt (internal)", () => {
  it("numbers components from 1", () => {
    const prompt = __testing.buildSelectionPrompt("Draft.", ["a", "b"]);
    expect(prompt).toContain("1. a");
    expect(prompt).toContain("2. b");
    expect(prompt).toContain("integer 1-2 or null");
  });
});
