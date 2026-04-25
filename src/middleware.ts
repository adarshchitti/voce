import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecretSync, getCronSecretSync } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/linkedin", "/api/auth/linkedin/callback"];
const CRON_PATHS = ["/api/cron/research", "/api/cron/generate"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (CRON_PATHS.some((p) => pathname.startsWith(p))) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${getCronSecretSync()}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session");
  if (!session || session.value !== getAuthSecretSync()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
