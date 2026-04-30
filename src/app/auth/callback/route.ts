import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inbox";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await db
          .insert(userSettings)
          .values({
            userId: user.id,
            cadenceMode: "daily",
            draftsPerDay: 3,
            preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
            preferredTime: "09:00",
            timezone: "UTC",
            jitterMinutes: 15,
          })
          .onConflictDoNothing();
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
