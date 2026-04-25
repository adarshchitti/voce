export async function publishToLinkedIn(
  accessToken: string,
  personUrn: string,
  text: string,
): Promise<{ success: true; postId: string } | { success: false; error: string }> {
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
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
