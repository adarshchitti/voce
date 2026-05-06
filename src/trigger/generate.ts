import { schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { archiveStalePendingDrafts, runGeneratePipelineForUser } from "@/lib/pipeline/generate";

export const generateDraftsTask = schedules.task({
  id: "generate-drafts",
  maxDuration: 300,
  retry: {
    maxAttempts: 2,
  },
  run: async (payload) => {
    const userId = payload.externalId;
    if (!userId) throw new Error("No userId in schedule externalId");

    try {
      await archiveStalePendingDrafts();
      const result = await runGeneratePipelineForUser(userId);
      return {
        phase: "generate",
        ...result,
      };
    } catch (error) {
      // Safety net: if runGeneratePipelineForUser throws before its internal
      // persistUserCronResult / persistUserCronFailure call lands, write a
      // minimal cron_runs row here so the run is still observable. Rethrow
      // so Trigger.dev applies its retry policy.
      const message = error instanceof Error ? error.message : String(error);
      await db
        .insert(cronRuns)
        .values({
          phase: "generate",
          result: { userId, error: message.slice(0, 500), triggerFallback: true },
          errorCount: 1,
          success: false,
        })
        .catch((err) => {
          console.error("Trigger.dev fallback cron_runs insert failed for user:", userId, err);
        });
      throw error;
    }
  },
});
