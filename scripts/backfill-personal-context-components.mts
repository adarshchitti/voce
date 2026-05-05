// Usage: npx tsx scripts/backfill-personal-context-components.mts
//
// One-shot backfill for the personal_context_components column added in
// migration 0010. Existing users with a non-empty personal_context but an
// empty (default) personal_context_components array would otherwise see the
// "Personalized for tone. Add more specific experiences..." notice on every
// "Add personal angle" click until they manually re-save their voice profile.
//
// This script iterates affected rows, runs extractPersonalContextComponents
// (a Haiku call per row, ~3-5 seconds + ~$0.0015 each), and persists the
// result. Idempotent: rows where personal_context_components is already
// populated are skipped, so the script can be re-run safely.
//
// The extractor is fail-open — a Haiku failure leaves the row untouched, so
// the backfill never makes things worse than the pre-state.

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const { db } = await import("../src/lib/db/index");
const { voiceProfiles } = await import("../src/lib/db/schema");
const { and, eq, isNotNull, ne, sql } = await import("drizzle-orm");
const { extractPersonalContextComponents } = await import(
  "../src/lib/ai/extract-personal-context"
);

// Find rows where personal_context is non-empty AND personal_context_components
// is empty / null. Default for new rows is '[]'::jsonb so we check both shapes.
const rows = await db
  .select({
    userId: voiceProfiles.userId,
    personalContext: voiceProfiles.personalContext,
    personalContextComponents: voiceProfiles.personalContextComponents,
  })
  .from(voiceProfiles)
  .where(
    and(
      isNotNull(voiceProfiles.personalContext),
      ne(voiceProfiles.personalContext, ""),
      // jsonb '[]' OR null counts as "empty". Use jsonb_array_length for the
      // common populated-but-empty case; OR with the null check.
      sql`(${voiceProfiles.personalContextComponents} IS NULL OR jsonb_array_length(${voiceProfiles.personalContextComponents}) = 0)`,
    ),
  );

console.log(`Found ${rows.length} voice_profiles row(s) needing backfill.`);
if (rows.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

let processed = 0;
let extracted = 0;
let emptyResults = 0;
let errors = 0;

for (const row of rows) {
  processed += 1;
  const rawText = row.personalContext ?? "";
  const label = `[${processed}/${rows.length}] user ${row.userId.slice(0, 8)}…`;
  try {
    const result = await extractPersonalContextComponents(rawText);
    await db
      .update(voiceProfiles)
      .set({
        personalContextComponents: result.components,
        updatedAt: new Date(),
      })
      .where(eq(voiceProfiles.userId, row.userId));
    if (result.components.length > 0) {
      extracted += 1;
      console.log(`${label} → extracted ${result.components.length} component(s)`);
    } else {
      emptyResults += 1;
      console.log(`${label} → no components extractable (vague text or extractor fail-open)`);
    }
  } catch (err) {
    // extractPersonalContextComponents is fail-open so we shouldn't reach
    // this branch in practice. Logged for visibility just in case.
    errors += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${label} → unexpected error: ${message.slice(0, 200)}`);
  }
}

console.log("");
console.log(`Done. ${processed} processed, ${extracted} extracted, ${emptyResults} empty, ${errors} errors.`);
process.exit(0);
