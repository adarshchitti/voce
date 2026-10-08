/**
 * Demo mode.
 *
 * Serves hand-authored fixtures instead of touching Supabase, the Anthropic API
 * or LinkedIn, so the product can be demonstrated with the database offline.
 * See UI_OVERHAUL_PLAN.md §6.
 *
 * Off unless DEMO_MODE is explicitly "true" — never let this default on.
 */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Whether the single "generate live" affordance should call the real model. */
export function isLiveGenerate(): boolean {
  return isDemo() && process.env.DEMO_LIVE_GENERATE === "true";
}

/** Stable synthetic user. Matches the uuid shape the schema's text columns hold. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_EMAIL = "demo@voce.app";

export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: DEMO_EMAIL,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "demo", providers: ["demo"] },
  user_metadata: { full_name: "Demo User" },
  created_at: "2026-09-01T00:00:00.000Z",
} as const;
