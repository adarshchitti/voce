import { schedules, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { generateDraftsTask } from "./generate";

export const scheduleUserGenerateTask = schemaTask({
  id: "schedule-user-generate",
  schema: z.object({
    userId: z.string(),
    preferredTime: z.string(),
    timezone: z.string(),
    cadenceMode: z.enum(["daily", "weekly", "on_demand"]),
  }),
  run: async ({ userId, preferredTime, timezone, cadenceMode }) => {
    if (cadenceMode === "on_demand") {
      try {
        await schedules.del(`user-generate-${userId}`);
      } catch {
        // Schedule may not exist.
      }
      return { scheduled: false, reason: "on_demand" };
    }

    const [hour, minute] = preferredTime.split(":").map(Number);
    const cronPattern = cadenceMode === "daily" ? `${minute} ${hour} * * *` : `${minute} ${hour} * * 1`;

    await schedules.create({
      task: generateDraftsTask.id,
      cron: cronPattern,
      timezone,
      deduplicationKey: `user-generate-${userId}`,
      externalId: userId,
    });

    return {
      scheduled: true,
      cronPattern,
      timezone,
      cadenceMode,
    };
  },
});
