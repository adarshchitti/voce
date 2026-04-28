const LINKEDIN_API_BASE = "https://api.linkedin.com";
const LINKEDIN_API_VERSION = "202505";

export async function publishToLinkedIn({
  accessToken,
  personUrn,
  text,
  articleUrl,
  articleTitle,
}: {
  accessToken: string
  personUrn: string
  text: string
  articleUrl?: string | null
  articleTitle?: string | null
}): Promise<{ success: true; postId: string } | { success: false; error: string }> {
  const postBody: Record<string, unknown> = {
    author: personUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (articleUrl) {
    postBody.content = {
      article: {
        source: articleUrl,
        title: articleTitle ?? 'Read more',
      },
    };
  }

  const response = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  if (response.status === 401) {
    return { success: false, error: "TOKEN_EXPIRED" };
  }
  if (!response.ok) {
    const body = await response.text();
    return { success: false, error: `LinkedIn API error ${response.status}: ${body}` };
  }
  const postId = response.headers.get("x-restli-id") ?? "";
  return { success: true, postId };
}
