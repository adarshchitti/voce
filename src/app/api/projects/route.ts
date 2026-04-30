import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, seriesTopicSubscriptions, topicSubscriptions } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getProjectLinkedTopics, getProjectPostStats } from "@/lib/projects";

type CreateProjectBody = {
  title?: string;
  goal?: string;
  targetAudience?: string;
  arcType?: string;
  targetPosts?: number;
  startDate?: string;
  endDate?: string;
  postTypePreferences?: string[];
  projectSourceUrls?: string[];
  projectTopics?: string[];
  hashtags?: string[];
  autoGenerate?: boolean;
  linkedTopics?: Array<{ topicSubscriptionId: string; priorityWeight: number }>;
};

function toProjectResponse(
  project: typeof contentSeries.$inferSelect,
  postsPublished: number,
  lastPublishedAt: Date | null,
  linkedTopics: Array<{ topicSubscriptionId: string; topicLabel: string; priorityWeight: number }>,
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
  };
}

export async function GET() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const projects = await db.query.contentSeries.findMany({
      where: eq(contentSeries.userId, userId),
    });
    const statsBySeries = await getProjectPostStats(
      projects.map((project) => project.id),
      userId,
    );
    const linkedBySeries = new Map<string, Awaited<ReturnType<typeof getProjectLinkedTopics>>>();
    await Promise.all(
      projects.map(async (project) => {
        linkedBySeries.set(project.id, await getProjectLinkedTopics(project.id, userId));
      }),
    );
    return Response.json({
      projects: projects.map((project) => {
        const stats = statsBySeries.get(project.id);
        return toProjectResponse(
          project,
          stats?.postsPublished ?? 0,
          stats?.lastPublishedAt ?? null,
          linkedBySeries.get(project.id) ?? [],
        );
      }),
    });
  } catch {
    return Response.json({ error: "Failed to fetch projects" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as CreateProjectBody;
    if (!body.title?.trim()) {
      return Response.json({ error: "title is required" }, { status: 400 });
    }
    const title = body.title.trim();
    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(contentSeries)
        .values({
          userId,
          title,
          goal: body.goal ?? null,
          targetAudience: body.targetAudience ?? null,
          arcType: body.arcType ?? null,
          targetPosts: body.targetPosts ?? null,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          postTypePreferences: body.postTypePreferences ?? [],
          projectSourceUrls: body.projectSourceUrls ?? [],
          projectTopics: body.projectTopics ?? [],
          hashtags: body.hashtags ?? [],
          autoGenerate: body.autoGenerate ?? true,
        })
        .returning();

      const linkedTopics = body.linkedTopics ?? [];
      if (linkedTopics.length) {
        const allowedTopics = await tx
          .select({ id: topicSubscriptions.id })
          .from(topicSubscriptions)
          .where(eq(topicSubscriptions.userId, userId));
        const allowedSet = new Set(allowedTopics.map((topic) => topic.id));
        const inserts = linkedTopics
          .filter((topic) => allowedSet.has(topic.topicSubscriptionId))
          .map((topic) => ({
            seriesId: project.id,
            topicSubscriptionId: topic.topicSubscriptionId,
            priorityWeight: Math.min(5, Math.max(1, topic.priorityWeight)),
          }));
        if (inserts.length) {
          await tx.insert(seriesTopicSubscriptions).values(inserts);
        }
      }
      return project;
    });

    const linkedTopics = await getProjectLinkedTopics(created.id, userId);
    return Response.json({
      project: toProjectResponse(created, 0, null, linkedTopics),
    });
  } catch {
    return Response.json({ error: "Failed to create project" }, { status: 400 });
  }
}

