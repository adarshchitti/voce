import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

const defaults = {
  cadenceMode: "daily",
  draftsPerDay: 3,
  preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
  preferredTime: "09:00",
  timezone: "UTC",
  jitterMinutes: 15,
};

export async function GET() {
  try {
    const userId = await requireAuth();
    let settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    if (!settings) {
      const [created] = await db.insert(userSettings).values({ userId, ...defaults }).returning();
      settings = created;
    }
    return Response.json({ settings });
  } catch {
    return Response.json({ error: "Failed to fetch settings" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireAuth();
    const body = (await request.json()) as Partial<typeof userSettings.$inferInsert>;
    await db.update(userSettings).set({ ...body, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update settings" }, { status: 400 });
  }
}
