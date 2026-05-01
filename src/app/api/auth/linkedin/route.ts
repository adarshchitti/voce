import { cookies } from "next/headers";
import { buildLinkedInAuthorizeUrl, generateOAuthState } from "@/lib/linkedin/oauth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const next = url.searchParams.get("next") ?? "/settings?linkedin=connected";
    const state = generateOAuthState();
    const cookieStore = await cookies();
    cookieStore.set("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    cookieStore.set("linkedin_oauth_next", next, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return Response.redirect(buildLinkedInAuthorizeUrl(state));
  } catch (error) {
    // Temporary: log the real error
    console.error("LinkedIn OAuth error:", error)
    return Response.json({ 
      error: "Failed to start LinkedIn OAuth",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 400 })
  }
}
