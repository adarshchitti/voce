import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { getCronSecret } from "@/lib/linkedin/oauth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getCronSecret()}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await db.select().from(cronRuns).orderBy(desc(cronRuns.ranAt)).limit(20);
  return Response.json(runs);
}
