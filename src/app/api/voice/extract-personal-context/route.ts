import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { extractPersonalContextComponents } from "@/lib/ai/extract-personal-context";

// Manual re-extraction endpoint. Reads the user's currently-saved
// personal_context, runs extraction, and persists the new components. Useful
// when an earlier extraction failed silently or when the user wants to
// re-run after editing the underlying text (instead of editing then saving).
//
// The settings UI surfaces this as a "Re-extract components" button next
// to the personal_context textarea.
export async function POST() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;

    const profile = await db.query.voiceProfiles.findFirst({
      where: eq(voiceProfiles.userId, userId),
    });
    const rawText = profile?.personalContext?.trim() ?? "";
    if (!rawText) {
      return Response.json(
        {
          error: "No personal_context saved. Add your background in Settings first.",
          code: "NO_PERSONAL_CONTEXT",
        },
        { status: 400 },
      );
    }

    const result = await extractPersonalContextComponents(rawText);
    await db
      .update(voiceProfiles)
      .set({ personalContextComponents: result.components, updatedAt: new Date() })
      .where(eq(voiceProfiles.userId, userId));

    return Response.json({ components: result.components, count: result.components.length });
  } catch {
    return Response.json({ error: "Failed to extract personal context" }, { status: 500 });
  }
}
