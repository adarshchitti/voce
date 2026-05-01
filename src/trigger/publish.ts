import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runPublishForPost } from "@/lib/pipeline/publish";

export const publishPostTask = schemaTask({
  id: "publish-post",
  schema: z.object({
    postId: z.string(),
    userId: z.string(),
  }),
  maxDuration: 60,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async ({ postId, userId }) => {
    const result = await runPublishForPost(postId, userId);

    return {
      phase: "publish",
      userId,
      ...result,
    };
  },
});
