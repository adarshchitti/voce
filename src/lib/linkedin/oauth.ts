import { randomBytes } from "crypto";

export function getLinkedinConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing LinkedIn OAuth env vars");
  }
  const missing = [
    !clientId && "LINKEDIN_CLIENT_ID",
    !clientSecret && "LINKEDIN_CLIENT_SECRET",
    !redirectUri && "LINKEDIN_REDIRECT_URI",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(", ")}`)
  }

  return { clientId, clientSecret, redirectUri };
}

export function getCronSecret() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error("Missing CRON_SECRET");
  return cronSecret;
}

export function buildLinkedInAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getLinkedinConfig();
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email w_member_social");
  return url.toString();
}

export function generateOAuthState() {
  return randomBytes(8).toString("hex");
}

export async function exchangeCodeForToken(code: string) {
  const { clientId, clientSecret, redirectUri } = getLinkedinConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`LinkedIn token exchange failed (${response.status})`);
  }
  return (await response.json()) as { access_token: string; expires_in: number };
}

export async function fetchPersonUrn(accessToken: string) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`LinkedIn userinfo failed (${response.status})`);
  }
  const payload = (await response.json()) as { sub?: string };
  if (!payload.sub) throw new Error("LinkedIn userinfo missing sub");
  return `urn:li:person:${payload.sub}`;
}
