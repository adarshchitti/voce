import { isDemo } from "@/lib/demo/mode";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // 303 so the browser follows with GET even when the POST came from a form.
  if (isDemo()) return NextResponse.redirect(new URL("/login", request.url), 303);
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SUPABASE_URL!));
}
