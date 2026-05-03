// One-off: run the daily generation pipeline for a single user.
// Usage: npx tsx scripts/run-cron-for-user.mts <userId>
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: tsx scripts/run-cron-for-user.mts <userId>");
  process.exit(1);
}

const { runGeneratePipelineForUser, archiveStalePendingDrafts } = await import("../src/lib/pipeline/generate.ts");
const start = Date.now();
await archiveStalePendingDrafts();
const result = await runGeneratePipelineForUser(userId);
console.log("\n=== runGeneratePipelineForUser result ===");
console.log(JSON.stringify(result, null, 2));
console.log(`\nTotal duration: ${Date.now() - start}ms`);
process.exit(0);
