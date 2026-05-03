// Diagnostic: prints getSubscriptionStatus() for every auth user, plus the
// cron-skip behaviour on a temporarily-expired beta. Read-only on the live data
// except for the brief expired-beta toggle, which is restored before exit.
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const { createClient } = await import("@supabase/supabase-js");
const { db } = await import("../src/lib/db/index");
const { userSettings } = await import("../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { getSubscriptionStatus } = await import("../src/lib/subscription");
const { runGeneratePipelineForUser } = await import("../src/lib/pipeline/generate");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: usersData, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) throw error;

console.log("=== getSubscriptionStatus for each user ===");
for (const u of usersData.users) {
  const r = await getSubscriptionStatus(u.id);
  console.log(
    `  ${(u.email ?? "(no email)").padEnd(38)} status=${r.status.padEnd(10)} canGenerate=${r.canGenerate} canPublish=${r.canPublish} betaUntil=${r.betaAccessUntil?.toISOString() ?? "null"}`,
  );
}

console.log("\n=== Cron skip path: temporarily expire beta on the test user ===");
const testEmail = "chittimooriadarsh@gmail.com";
const testUser = usersData.users.find((u) => u.email === testEmail);
if (!testUser) {
  console.error(`Test user ${testEmail} not found.`);
  process.exit(1);
}
const [pre] = await db
  .select({ betaAccessUntil: userSettings.betaAccessUntil })
  .from(userSettings)
  .where(eq(userSettings.userId, testUser.id))
  .limit(1);
const originalBeta = pre?.betaAccessUntil ?? null;

const expired = new Date(Date.now() - 24 * 60 * 60 * 1000);
await db
  .update(userSettings)
  .set({ betaAccessUntil: expired })
  .where(eq(userSettings.userId, testUser.id));

const accessAfterExpiry = await getSubscriptionStatus(testUser.id);
console.log(`  status after expiry: ${accessAfterExpiry.status}, canGenerate=${accessAfterExpiry.canGenerate}`);

console.log("  invoking runGeneratePipelineForUser — should skip with reason=no_access...");
const cronResult = await runGeneratePipelineForUser(testUser.id);
console.log("  cron result:", JSON.stringify(cronResult, null, 2));

await db
  .update(userSettings)
  .set({ betaAccessUntil: originalBeta })
  .where(eq(userSettings.userId, testUser.id));
console.log(`  restored beta_access_until to ${originalBeta?.toISOString() ?? "null"}`);

process.exit(0);
