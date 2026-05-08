import { schedules, logger } from "@trigger.dev/sdk/v3";
import { logPublishSweep, runPublishSweep } from "@/lib/pipeline/publish";

export const publishSweepTask = schedules.task({
  id: "publish-sweep",
  cron: "*/5 * * * *",
  maxDuration: 1800,
  retry: {
    maxAttempts: 2,
  },
  run: async () => {
    const startTime = Date.now();
    const result = await runPublishSweep();
    await logPublishSweep(startTime, result);

    logger.log("publish-sweep complete", {
      claimed: result.claimed,
      published: result.published,
      failed: result.failed,
      zombiesReset: result.zombiesReset,
      zombiesFailed: result.zombiesFailed,
      errorCount: result.errors.length,
    });

    return {
      phase: "publish-sweep",
      ...result,
    };
  },
});
