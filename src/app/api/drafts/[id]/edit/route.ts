import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    const body = (await request.json()) as { editedText?: string };
    const editedText = body.editedText ?? "";
    if (editedText.length > 3000) return Response.json({ error: "Draft exceeds 3000 characters" }, { status: 400 });

    const draft = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")) });
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    await db.update(draftQueue).set({ editedText }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to save draft edit" }, { status: 400 });
  }
}
