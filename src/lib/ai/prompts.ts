import type { ContentSeries } from "@/lib/db/schema";
import {
  FIELD_LIMITS,
  sanitiseBannedWords,
  sanitiseInstruction,
  sanitiseShortText,
} from "@/lib/sanitise";

/**
 * Final guard for values passed into `generateDraft` / Claude system prompts.
 * Call at the start of generation so DB-backed strings are re-sanitised at use time.
 */
export function sanitiseGenerationPromptInputs(input: {
  userNotes?: string | null;
  personalContext?: string | null;
  rawDescription: string;
  instruction?: string | null;
  userBannedWords?: string[] | null;
  projectContext?: string | null;
}) {
  // SECURITY: All user content must be sanitised before injection.
  // Do not remove these calls — they prevent prompt injection attacks.
  return {
    userNotes: input.userNotes?.trim()
      ? sanitiseShortText(input.userNotes, FIELD_LIMITS.userNotes)
      : null,
    personalContext: input.personalContext?.trim()
      ? sanitiseShortText(input.personalContext, FIELD_LIMITS.personalContext)
      : null,
    rawDescription: sanitiseShortText(input.rawDescription || "", FIELD_LIMITS.samplePost),
    instruction: input.instruction?.trim()
      ? input.instruction.length <= FIELD_LIMITS.regenerationInstruction
        ? sanitiseInstruction(input.instruction)
        : sanitiseShortText(input.instruction, 4000)
      : undefined,
    userBannedWords: input.userBannedWords?.length ? sanitiseBannedWords(input.userBannedWords) : null,
    projectContext: input.projectContext?.trim()
      ? sanitiseShortText(input.projectContext, FIELD_LIMITS.seriesDescription)
      : null,
  };
}

export function buildProjectContext(params: {
  project: ContentSeries;
  seriesPosition: number;
  postsPublished: number;
  previousPostContext: string | null;
}): string {
  // SECURITY: All user content must be sanitised before injection.
  // Do not remove these calls — they prevent prompt injection attacks.
  const { project, seriesPosition, postsPublished, previousPostContext } = params;

  const safeTitle = sanitiseShortText(project.title, FIELD_LIMITS.seriesGoal);
  const safeGoal = project.goal ? sanitiseShortText(project.goal, FIELD_LIMITS.goal) : null;
  const safeAudience = project.targetAudience
    ? sanitiseShortText(project.targetAudience, FIELD_LIMITS.targetAudience)
    : null;
  const safePrevious = previousPostContext
    ? sanitiseShortText(previousPostContext, FIELD_LIMITS.seriesDescription)
    : null;
  const safePostTypes = project.postTypePreferences?.length
    ? project.postTypePreferences.map((p) => sanitiseShortText(p, 80))
    : [];
  const safeHashtags = project.hashtags?.length
    ? project.hashtags.map((h) => sanitiseShortText(h, 80))
    : [];

  const timelineNote = project.targetPosts
    ? `This is post ${seriesPosition} of ${project.targetPosts} planned posts.`
    : `This is post ${seriesPosition} in an ongoing series.`;

  const progressNote =
    postsPublished > 0
      ? `${postsPublished} posts have been published in this series so far.`
      : "This is the first post in this series.";

  const previousNote = safePrevious
    ? `The previous post in this series covered: ${safePrevious}\nBuild on this - don't recap it at length. A brief reference is enough.`
    : "";

  const audienceNote = safeAudience ? `Target audience: ${safeAudience}` : "";
  const postTypeNote = safePostTypes.length
    ? `Preferred post types for this project: ${safePostTypes.join(", ")}`
    : "";

  return [
    "PROJECT CONTEXT:",
    `Project: ${safeTitle}`,
    safeGoal ? `Goal: ${safeGoal}` : null,
    audienceNote || null,
    timelineNote,
    progressNote,
    postTypeNote || null,
    previousNote || null,
    safeHashtags.length ? `Always include these hashtags: ${safeHashtags.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
