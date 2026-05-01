import { schedules } from "@trigger.dev/sdk/v3";
import { logResearchRun, runResearchPipeline } from "@/lib/pipeline/research";

export const researchTask = schedules.task({
  id: "daily-research",
  cron: "0 2 * * *",
  maxDuration: 600,
  run: async () => {
    const startTime = Date.now();
    const result = await runResearchPipeline();
    await logResearchRun(startTime, result);

    return {
      phase: "research",
      ...result,
    };
  },
});
