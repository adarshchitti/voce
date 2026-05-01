import { eq } from "drizzle-orm";
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { linkedinTokens, userSettings } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import type { scheduleUserGenerateTask } from "@/trigger/scheduleUserGenerate";

const defaults = {
  cadenceMode: "daily",
  draftsPerDay: 3,
  preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
  preferredTime: "09:00",
  timezone: "UTC",
  jitterMinutes: 15,
};

const schedulingPreferencesSchema = z.object({
  cadenceMode: z.enum(["daily", "weekly", "on_demand"]).optional(),
  draftsPerDay: z.number().int().min(1).max(5).optional(),
  preferredDays: z.array(z.string()).optional(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().min(1).optional(),
  jitterMinutes: z.number().int().min(0).max(30).optional(),
  tellFlagNumberedLists: z.enum(["always", "three_plus", "never"]).optional(),
  tellFlagEmDash: z.boolean().optional(),
  tellFlagEngagementBeg: z.boolean().optional(),
  tellFlagBannedWords: z.boolean().optional(),
  tellFlagEveryLine: z.boolean().optional(),
});

export async function GET() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    let settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    if (!settings) {
      const [created] = await db.insert(userSettings).values({ userId, ...defaults }).returning();
      settings = created;
    }
    const tokenRows = await db.select().from(linkedinTokens).where(eq(linkedinTokens.userId, userId)).limit(1);
    const linkedinToken = tokenRows[0] ?? null;
    return Response.json({ settings, linkedinToken });
  } catch {
    return Response.json({ error: "Failed to fetch settings" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as Partial<typeof userSettings.$inferInsert>;
    await db.update(userSettings).set({ ...body, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update settings" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = await request.json();
    const parsed = schedulingPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid scheduling preferences" }, { status: 400 });
    }

    const values = parsed.data;
    await db
      .insert(userSettings)
      .values({
        userId,
        cadenceMode: values.cadenceMode ?? defaults.cadenceMode,
        draftsPerDay: values.draftsPerDay ?? defaults.draftsPerDay,
        preferredDays: values.preferredDays ?? defaults.preferredDays,
        preferredTime: values.preferredTime ?? defaults.preferredTime,
        timezone: values.timezone ?? defaults.timezone,
        jitterMinutes: values.jitterMinutes ?? defaults.jitterMinutes,
        tellFlagNumberedLists: values.tellFlagNumberedLists ?? "three_plus",
        tellFlagEmDash: values.tellFlagEmDash ?? true,
        tellFlagEngagementBeg: values.tellFlagEngagementBeg ?? true,
        tellFlagBannedWords: values.tellFlagBannedWords ?? true,
        tellFlagEveryLine: values.tellFlagEveryLine ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...(values.cadenceMode !== undefined && { cadenceMode: values.cadenceMode }),
          ...(values.draftsPerDay !== undefined && { draftsPerDay: values.draftsPerDay }),
          ...(values.preferredDays !== undefined && { preferredDays: values.preferredDays }),
          ...(values.preferredTime !== undefined && { preferredTime: values.preferredTime }),
          ...(values.timezone !== undefined && { timezone: values.timezone }),
          ...(values.jitterMinutes !== undefined && { jitterMinutes: values.jitterMinutes }),
          ...(values.tellFlagNumberedLists !== undefined && { tellFlagNumberedLists: values.tellFlagNumberedLists }),
          ...(values.tellFlagEmDash !== undefined && { tellFlagEmDash: values.tellFlagEmDash }),
          ...(values.tellFlagEngagementBeg !== undefined && { tellFlagEngagementBeg: values.tellFlagEngagementBeg }),
          ...(values.tellFlagBannedWords !== undefined && { tellFlagBannedWords: values.tellFlagBannedWords }),
          ...(values.tellFlagEveryLine !== undefined && { tellFlagEveryLine: values.tellFlagEveryLine }),
          updatedAt: new Date(),
        },
      });

    const scheduledSettings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
    if (scheduledSettings) {
      await tasks.trigger<typeof scheduleUserGenerateTask>("schedule-user-generate", {
        userId,
        preferredTime: scheduledSettings.preferredTime,
        timezone: scheduledSettings.timezone,
        cadenceMode: (scheduledSettings.cadenceMode as "daily" | "weekly" | "on_demand") ?? "daily",
      });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update preferences" }, { status: 400 });
  }
}
