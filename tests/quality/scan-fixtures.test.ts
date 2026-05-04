import { describe, expect, it } from "vitest";
import { runQualityScan } from "@/lib/ai/quality-scan";
import { SCAN_FIXTURES } from "./scan-fixtures";

// Regression eval against hand-authored fixtures. Each fixture asserts a
// narrow contract — mustFlag rules MUST fire, mustNotFlag rules MUST NOT.
// Other rules may fire and that's fine; we don't lock the full set.
//
// The clean_baseline fixture is the only one that asserts every rule is
// silent — it's the over-flagging detector.

describe("quality-scan fixtures", () => {
  for (const fx of SCAN_FIXTURES) {
    it(`${fx.name} — ${fx.description}`, () => {
      const result = runQualityScan(fx.draftText, fx.ctx, fx.opts ?? {});
      const fired = new Set(result.flags.map((f) => f.ruleId));

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
