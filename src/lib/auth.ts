import { cookies } from "next/headers";

const SESSION_COOKIE = "session";
export const OWNER_USER_ID = "owner"; // STAGE2: replace with Supabase auth.uid()

export async function getAuthSecret(): Promise<string> {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("Missing AUTH_SECRET");
  }
  return value;
}

export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  if (!session?.value) return null;
  return session.value === (await getAuthSecret()) ? OWNER_USER_ID : null;
}

export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function getAuthSecretSync() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("Missing AUTH_SECRET");
  return value;
}

export function getCronSecretSync() {
  const value = process.env.CRON_SECRET;
  if (!value) throw new Error("Missing CRON_SECRET");
  return value;
}
