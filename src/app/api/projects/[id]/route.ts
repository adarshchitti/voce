import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getProjectLinkedTopics, getProjectPostStats, getRecentProjectPosts } from "@/lib/projects";

type UpdateProjectBody = Partial<{
  title: string;
  goal: string;
  targetAudience: string;
  arcType: string;
  targetPosts: number | null;
  startDate: string | null;
  endDate: string | null;
  postTypePreferences: string[];
  projectSourceUrls: string[];
  projectTopics: string[];
  hashtags: string[];
  autoGenerate: boolean;
  status: string;
}>;

function toProjectDetail(
  project: typeof contentSeries.$inferSelect,
  postsPublished: number,
  lastPublishedAt: Date | null,
  linkedTopics: Awaited<ReturnType<typeof getProjectLinkedTopics>>,
  recentPosts: Awaited<ReturnType<typeof getRecentProjectPosts>>,
) {
  return {
    id: project.id,
    title: project.title,
    goal: project.goal,
    targetAudience: project.targetAudience,
    status: project.status,
    arcType: project.arcType,
    startDate: project.startDate,
    endDate: project.endDate,
    targetPosts: project.targetPosts,
    postTypePreferences: project.postTypePreferences ?? [],
    autoGenerate: project.autoGenerate,
    hashtags: project.hashtags ?? [],
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    postsPublished,
    lastPublishedAt: lastPublishedAt ? lastPublishedAt.toISOString() : null,
    linkedTopics,
    description: project.description,
    projectSourceUrls: project.projectSourceUrls ?? [],
    projectTopics: project.projectTopics ?? [],
    recentPosts: recentPosts.map((post) => ({
      id: post.id,
      contentSnapshot: post.contentSnapshot,
      status: post.status,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      scheduledAt: post.scheduledAt.toISOString(),
      voiceScore: post.voiceScore,
    })),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    const project = await db.query.contentSeries.findFirst({
      where: and(eq(contentSeries.id, id), eq(contentSeries.userId, userId)),
      orderBy: [desc(contentSeries.updatedAt)],
    });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    const [statsBySeries, linkedTopics, recentPosts] = await Promise.all([
      getProjectPostStats([project.id], userId),
      getProjectLinkedTopics(project.id, userId),
      getRecentProjectPosts(project.id, userId),
    ]);
    const stats = statsBySeries.get(project.id);
    return Response.json({
      project: toProjectDetail(project, stats?.postsPublished ?? 0, stats?.lastPublishedAt ?? null, linkedTopics, recentPosts),
    });
  } catch {
    return Response.json({ error: "Failed to fetch project" }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    const body = (await request.json()) as UpdateProjectBody;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      "title",
      "goal",
      "targetAudience",
      "arcType",
      "targetPosts",
      "startDate",
      "endDate",
      "postTypePreferences",
      "projectSourceUrls",
      "projectTopics",
      "hashtags",
      "autoGenerate",
      "status",
    ] as const;
    for (const field of fields) {
      if (field in body) updates[field] = body[field];
    }
    const [project] = await db
      .update(contentSeries)
      .set(updates)
      .where(and(eq(contentSeries.id, id), eq(contentSeries.userId, userId)))
      .returning();
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ project });
  } catch {
    return Response.json({ error: "Failed to update project" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    await db
      .update(contentSeries)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(contentSeries.id, id), eq(contentSeries.userId, userId)));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete project" }, { status: 400 });
  }
}

