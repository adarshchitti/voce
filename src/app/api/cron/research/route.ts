import { getCronSecret } from "@/lib/linkedin/oauth";
import { logResearchRun, runResearchPipeline } from "@/lib/pipeline/research";

export const GET = POST;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startTime = Date.now();
    const result = await runResearchPipeline();
    await logResearchRun(startTime, result);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Research cron failed" }, { status: 400 });
  }
}
