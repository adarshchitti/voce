import { getCronSecret } from "@/lib/linkedin/oauth";
import { logPublishRun, runPublishForDueUsers } from "@/lib/pipeline/publish";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getCronSecret()}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  try {
    const result = await runPublishForDueUsers();
    await logPublishRun(startTime, result);
    return Response.json(result);
  } catch (error) {
    console.error("Publish cron error:", error);
    return Response.json({ error: "Publish cron failed" }, { status: 400 });
  }
}

// Vercel crons always use GET
export const POST = GET;
