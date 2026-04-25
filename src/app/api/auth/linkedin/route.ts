import { cookies } from "next/headers";
import { buildLinkedInAuthorizeUrl, generateOAuthState } from "@/lib/linkedin/oauth";

export async function GET() {
  try {
    const state = generateOAuthState();
    const cookieStore = await cookies();
    cookieStore.set("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return Response.redirect(buildLinkedInAuthorizeUrl(state));
  } catch {
    return Response.json({ error: "Failed to start LinkedIn OAuth" }, { status: 400 });
  }
}
