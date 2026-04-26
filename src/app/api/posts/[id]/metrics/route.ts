import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { OWNER_USER_ID } from "@/lib/auth";
import { posts } from "@/lib/db/schema";

const schema = z.object({
  manualImpressions: z.number().int().min(0).optional(),
  manualReactions: z.number().int().min(0).optional(),
  manualComments: z.number().int().min(0).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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
          eq(posts.userId, OWNER_USER_ID), // STAGE2: replace with supabase auth.uid()
        ),
      );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to update metrics" }, { status: 400 });
  }
}
