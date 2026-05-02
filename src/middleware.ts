import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const publicPaths = ["/login", "/signup", "/auth/callback", "/api/cron/", "/api/billing/webhook"];
  const isPublic = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  const { supabaseResponse, user } = await updateSession(request);

  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  if (isPublic) {
    return supabaseResponse;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
