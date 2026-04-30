import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { posts } from "@/lib/db/schema";

const schema = z.object({
  manualImpressions: z.number().int().min(0).optional(),
  manualReactions: z.number().int().min(0).optional(),
  manualComments: z.number().int().min(0).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = schema.parse(await request.json());
    const { id } = await params;

    await db
      .update(posts)
      .set({
        ...body,
        manualNotesUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.userId, userId),
        ),
      );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to update metrics" }, { status: 400 });
  }
}
