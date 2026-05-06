import { describe, expect, it } from "vitest";
import {
  PERSONAL_ANGLE_BLOCK_HEADING,
  buildPersonalAngleInstruction,
} from "@/lib/ai/personal-angle";

describe("personalize prompt — PERSONAL ANGLE block", () => {
  it("exposes a stable heading marker", () => {
    expect(PERSONAL_ANGLE_BLOCK_HEADING).toBe("PERSONAL ANGLE TO WEAVE IN");
  });

  it("renders the targeted-angle block when a component is selected", () => {
    const instruction = buildPersonalAngleInstruction(
      "shipped 3 RAG systems at a B2B startup in 2024",
    );
    expect(instruction).toMatchInlineSnapshot(`
      "PERSONAL ANGLE TO WEAVE IN:

      The user has the following personal experience that fits this draft topic:
      "shipped 3 RAG systems at a B2B startup in 2024"

      Weave this experience into the regenerated draft naturally. Use it to add specificity and first-person grounding. Do NOT extend or extrapolate beyond what's stated; if the component says "I shipped 3 RAG systems," do not say "I shipped many RAG systems and learned X, Y, Z" unless those details are in the component or other parts of the user's voice profile.

      The experience should feel naturally integrated, not bolted on. If you cannot find a graceful way to include it, you may produce a draft without explicit reference to it."
    `);
  });

  it("the heading appears verbatim in the rendered block (so callers can grep for it)", () => {
    const instruction = buildPersonalAngleInstruction("any component");
    expect(instruction.startsWith(`${PERSONAL_ANGLE_BLOCK_HEADING}:`)).toBe(true);
  });

  it("escapes nothing — the component string is rendered with surrounding quotes", () => {
    // The block uses straight double quotes around the component. If the
    // component contains a quote character, the prompt becomes ambiguous;
    // current behavior is to render as-is (Haiku is robust to this) but
    // we document it via this test so future changes are intentional.
    const instruction = buildPersonalAngleInstruction('I said "hello"');
    expect(instruction).toContain('"I said "hello""');
  });
});
