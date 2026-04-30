import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecretSync, getCronSecretSync } from "@/lib/auth";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/auth/login", "/api/auth/linkedin", "/api/auth/linkedin/callback"];

export async function middleware(request: NextRequest) {
  // Always refresh Supabase session first (required by @supabase/ssr)
  const { supabaseResponse } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/cron/')) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${getCronSecretSync()}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  const session = request.cookies.get("session");
  if (!session || session.value !== getAuthSecretSync()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
