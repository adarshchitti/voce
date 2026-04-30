import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const [row] = await db
      .select({ value: sql<number>`count(*)` })
      .from(draftQueue)
      .where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")));
    return Response.json({ pendingCount: Number(row?.value ?? 0) });
  } catch {
    return Response.json({ error: "Failed to fetch inbox count" }, { status: 400 });
  }
}

