// Usage: npx tsx scripts/grant-beta-access.ts user@example.com 365
// Grants (or extends) beta access by upserting user_settings.beta_access_until.
// Uses the Supabase service-role client to look up the auth.users row by email,
// matching the pattern in src/app/api/account/route.ts.

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const email = process.argv[2];
const daysArg = process.argv[3];
if (!email || !daysArg) {
  console.error("Usage: npx tsx scripts/grant-beta-access.ts <email> <days>");
  process.exit(1);
}
const days = Number(daysArg);
if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
  console.error(`Invalid days argument: ${daysArg} — must be a positive integer.`);
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

// auth.admin.listUsers paginates; for a small user base we scan all pages.
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

const betaUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Upsert: insert a default user_settings row if missing, set beta_access_until
// either way.
await db
  .insert(userSettings)
  .values({ userId, betaAccessUntil: betaUntil })
  .onConflictDoUpdate({
    target: userSettings.userId,
    set: { betaAccessUntil: betaUntil, updatedAt: new Date() },
  });

const [row] = await db
  .select({ betaAccessUntil: userSettings.betaAccessUntil })
  .from(userSettings)
  .where(eq(userSettings.userId, userId))
  .limit(1);

console.log(`Granted beta access to ${email} (user ${userId})`);
console.log(`  beta_access_until = ${row.betaAccessUntil?.toISOString()}`);
console.log(`  expires in ${days} day${days === 1 ? "" : "s"}`);
process.exit(0);
