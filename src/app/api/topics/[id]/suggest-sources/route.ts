import { isDemo } from "@/lib/demo/mode";
import { demoSuggestedSources } from "@/lib/demo/suggested-sources";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { topicSubscriptions } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { suggestSourcesForTopic } from "@/lib/ai/suggest-sources";
import { validateFeed } from "@/lib/research/validate-feed";
import { sanitiseTavilyQuery, sanitiseTopicLabel } from "@/lib/sanitise";

function flagOn(): boolean {
  return process.env.NEXT_PUBLIC_AUTO_SUGGEST_SOURCES === "true";
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemo()) {
    const { id } = await params;
    return Response.json(demoSuggestedSources(id));
  }
  if (!flagOn()) return Response.json({ error: "Not found" }, { status: 404 });

  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const topic = await db.query.topicSubscriptions.findFirst({
    where: and(eq(topicSubscriptions.id, id), eq(topicSubscriptions.userId, userId)),
  });
  if (!topic) return Response.json({ error: "Topic not found" }, { status: 404 });

  const topicLabel = sanitiseTopicLabel(topic.topicLabel);
  const tavilyQuery = sanitiseTavilyQuery(topic.tavilyQuery);

  const suggested = await suggestSourcesForTopic({ topicLabel, tavilyQuery });
  if (suggested.length === 0) {
    return Response.json({ candidates: [], stats: { requested: 0, validated: 0 } });
  }

  // Run validations in parallel — bounded at 5s total since each has its own timeout.
  const validations = await Promise.all(
    suggested.map(async (c) => ({ candidate: c, ok: (await validateFeed(c.url)).ok })),
  );
  const validated = validations.filter((v) => v.ok).map((v) => v.candidate);

  return Response.json({
    candidates: validated,
    stats: { requested: suggested.length, validated: validated.length },
  });
}
