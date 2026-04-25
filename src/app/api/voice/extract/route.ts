import { requireAuth } from "@/lib/auth";
import { extractVoicePatterns } from "@/lib/ai/extract-voice";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json()) as { samplePosts?: string[] };
    if (!body.samplePosts || body.samplePosts.length === 0) {
      return Response.json({ error: "samplePosts is required" }, { status: 400 });
    }
    const patterns = await extractVoicePatterns(body.samplePosts);
    return Response.json({ patterns });
  } catch {
    return Response.json({ error: "Failed to extract voice patterns" }, { status: 400 });
  }
}
