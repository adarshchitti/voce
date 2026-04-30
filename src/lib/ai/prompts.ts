import type { ContentSeries } from "@/lib/db/schema";

export function buildProjectContext(params: {
  project: ContentSeries;
  seriesPosition: number;
  postsPublished: number;
  previousPostContext: string | null;
}): string {
  const { project, seriesPosition, postsPublished, previousPostContext } = params;

  const timelineNote = project.targetPosts
    ? `This is post ${seriesPosition} of ${project.targetPosts} planned posts.`
    : `This is post ${seriesPosition} in an ongoing series.`;

  const progressNote = postsPublished > 0
    ? `${postsPublished} posts have been published in this series so far.`
    : "This is the first post in this series.";

  const previousNote = previousPostContext
    ? `The previous post in this series covered: ${previousPostContext}\nBuild on this - don't recap it at length. A brief reference is enough.`
    : "";

  const audienceNote = project.targetAudience ? `Target audience: ${project.targetAudience}` : "";
  const postTypeNote = project.postTypePreferences?.length
    ? `Preferred post types for this project: ${project.postTypePreferences.join(", ")}`
    : "";

  return [
    "PROJECT CONTEXT:",
    `Project: ${project.title}`,
    project.goal ? `Goal: ${project.goal}` : null,
    audienceNote || null,
    timelineNote,
    progressNote,
    postTypeNote || null,
    previousNote || null,
    project.hashtags?.length ? `Always include these hashtags: ${project.hashtags.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

