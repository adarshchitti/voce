import { getCronSecret } from "@/lib/linkedin/oauth";
import { logGenerateRun, runGenerateForDueUsers } from "@/lib/pipeline/generate";

export const GET = POST;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startTime = Date.now();

    const result = await runGenerateForDueUsers();
    await logGenerateRun(startTime, result);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Generate cron failed" }, { status: 400 });
  }
}
