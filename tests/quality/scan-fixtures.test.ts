import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Anthropic SDK mock — must be hoisted before importing modules that
// transitively pull it in. The fact-check fixtures rely on this mock.
const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { create: messagesCreate };
  },
}));

import { runQualityScan } from "@/lib/ai/quality-scan";
import { applyFactCheck } from "@/lib/ai/scan-draft";
import { SCAN_FIXTURES } from "./scan-fixtures";

// Regression eval against hand-authored fixtures. Each fixture asserts a
// narrow contract — mustFlag rules MUST fire, mustNotFlag rules MUST NOT.
// Other rules may fire and that's fine; we don't lock the full set.
//
// The clean_baseline fixture is the only one that asserts every rule is
// silent — it's the over-flagging detector.
//
// Fact-check fixtures (those with sourceItem + mockedVerifierResponse) take
// an async path that stubs the Anthropic SDK and verifies the fact-check
// flag is appended to the scan result.

beforeEach(() => {
  messagesCreate.mockReset();
});
afterEach(() => {
  messagesCreate.mockReset();
});

describe("quality-scan fixtures", () => {
  for (const fx of SCAN_FIXTURES) {
    it(`${fx.name} — ${fx.description}`, async () => {
      const syncResult = runQualityScan(fx.draftText, fx.ctx, fx.opts ?? {});

      let firedIds: string[];
      if (fx.sourceItem && fx.mockedVerifierResponse) {
        messagesCreate.mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify(fx.mockedVerifierResponse) }],
        });
        const scanResultShape = {
          draftText: syncResult.cleanedText,
          flags: syncResult.flags,
          hasEngagementBeg: syncResult.hasEngagementBeg,
          engagementBegFound: syncResult.engagementBegFound,
          markdownStripped: syncResult.markdownStripped,
          clean: syncResult.clean,
          structural: syncResult.structural,
        };
        const merged = await applyFactCheck(scanResultShape, fx.sourceItem);
        firedIds = merged.scanResult.flags.map((f) => f.ruleId);
      } else {
        firedIds = syncResult.flags.map((f) => f.ruleId);
      }

      const fired = new Set(firedIds);
      for (const rule of fx.mustFlag) {
        expect(
          fired.has(rule),
          `Expected '${rule}' to fire on fixture '${fx.name}', but actual flags were [${[...fired].sort().join(", ")}]`,
        ).toBe(true);
      }

      for (const rule of fx.mustNotFlag ?? []) {
        expect(
          fired.has(rule),
          `Expected '${rule}' to NOT fire on fixture '${fx.name}', but it did. Actual flags: [${[...fired].sort().join(", ")}]`,
        ).toBe(false);
      }
    });
  }
});
