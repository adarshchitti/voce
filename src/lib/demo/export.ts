/**
 * Demo-mode body for POST /api/account/export.
 *
 * Mirrors the real handler's JSON envelope, assembled from the in-memory
 * fixture stores. Read-only: nothing is persisted or deleted.
 */
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { demoDrafts } from "@/lib/demo/drafts";
import { demoInsights, demoPosts, demoProjects, demoSettings, demoTopics, demoVoice } from "@/lib/demo/workspace";

export function demoExportBody(): string {
  const drafts = ["pending", "approved", "rejected"].flatMap((status) => demoDrafts.list(status, 500).drafts);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      userId: DEMO_USER_ID,
      settings: demoSettings().settings,
      voiceProfile: demoVoice().voiceProfile,
      topics: demoTopics().topics,
      drafts,
      posts: demoPosts().posts,
      rejectionReasons: demoInsights().reasons,
      draftMemories: [],
      regenerationHistory: [],
      projects: demoProjects().projects,
    },
    null,
    2,
  );
}
