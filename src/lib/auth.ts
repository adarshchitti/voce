import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEMO_USER, DEMO_USER_ID, isDemo } from "@/lib/demo/mode";
import type { User } from "@supabase/supabase-js";

type AuthenticatedUserResult =
  | { user: User; userId: string; unauthorized: null }
  | { user: null; userId: null; unauthorized: NextResponse };

export async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  // Demo mode: no Supabase round-trip at all. The project is offline.
  if (isDemo()) {
    return { user: DEMO_USER as unknown as User, userId: DEMO_USER_ID, unauthorized: null };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      userId: null,
      unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, userId: user.id, unauthorized: null };
}

export async function requireAuth(): Promise<string> {
  const { userId } = await getAuthenticatedUser();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
