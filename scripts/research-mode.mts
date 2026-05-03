// Usage: npx tsx scripts/research-mode.mts <email> <mode>
//   mode: 'global_pool' | 'per_user_tavily'
//
// Phase 2 rollout flag-flip tool. Looks up the auth user by email via the
// Supabase service-role client, updates user_settings.daily_research_mode.
// Once Phase 2 is the default and the flag is removed (per the plan, after
// 4 weeks at per_user_tavily as default), this script gets deleted.

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const email = process.argv[2];
const mode = process.argv[3];
const VALID_MODES = new Set(["global_pool", "per_user_tavily"]);
if (!email || !mode) {
  console.error("Usage: npx tsx scripts/research-mode.mts <email> <mode>");
  console.error("  mode: 'global_pool' | 'per_user_tavily'");
  process.exit(1);
}
if (!VALID_MODES.has(mode)) {
  console.error(`Invalid mode: ${mode} — must be one of: ${[...VALID_MODES].join(", ")}`);
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const { db } = await import("../src/lib/db/index");
const { userSettings } = await import("../src/lib/db/schema");
const { eq } = await import("drizzle-orm");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(targetEmail: string): Promise<string | null> {
  const lower = targetEmail.toLowerCase().trim();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === lower);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

const userId = await findUserIdByEmail(email);
if (!userId) {
  console.error(`No auth user found for email: ${email}`);
  process.exit(1);
}

const result = await db
  .update(userSettings)
  .set({ dailyResearchMode: mode, updatedAt: new Date() })
  .where(eq(userSettings.userId, userId))
  .returning({ userId: userSettings.userId, dailyResearchMode: userSettings.dailyResearchMode });

if (result.length === 0) {
  console.error(`No user_settings row found for user ${userId} (${email}).`);
  console.error("Hint: the row may not exist yet — sign up flow or admin backfill?");
  process.exit(1);
}

console.log(`Updated ${email} (user ${userId})`);
console.log(`  daily_research_mode = ${result[0].dailyResearchMode}`);
process.exit(0);
