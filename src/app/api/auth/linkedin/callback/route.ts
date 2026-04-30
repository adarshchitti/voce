import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { linkedinTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForToken, fetchPersonUrn } from "@/lib/linkedin/oauth";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return Response.json({ error: "Missing code or state" }, { status: 400 });

    const cookieStore = await cookies();
    const cookieState = cookieStore.get("linkedin_oauth_state")?.value;
    if (!cookieState || cookieState !== state) return Response.json({ error: "Invalid OAuth state" }, { status: 400 });
    cookieStore.delete("linkedin_oauth_state");
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;

    const tokenData = await exchangeCodeForToken(code);
    const personUrn = await fetchPersonUrn(tokenData.access_token);
    const expiry = new Date(Date.now() + tokenData.expires_in * 1000);

    const existing = await db.query.linkedinTokens.findFirst({ where: eq(linkedinTokens.userId, userId) });
    if (existing) {
      await db
        .update(linkedinTokens)
        .set({ accessToken: tokenData.access_token, personUrn, tokenExpiry: expiry, status: "active", updatedAt: new Date() })
        .where(eq(linkedinTokens.userId, userId));
    } else {
      await db.insert(linkedinTokens).values({ userId, accessToken: tokenData.access_token, personUrn, tokenExpiry: expiry, status: "active" });
    }

    return Response.redirect(new URL("/settings?linkedin=connected", request.url));
  } catch {
    return Response.json({ error: "LinkedIn callback failed" }, { status: 400 });
  }
}
