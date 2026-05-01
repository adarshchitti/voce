import { schedules } from "@trigger.dev/sdk/v3";
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

    await archiveStalePendingDrafts();
    const result = await runGeneratePipelineForUser(userId);

    return {
      phase: "generate",
      ...result,
    };
  },
});
