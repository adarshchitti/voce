import { db } from "@/lib/db";
import { draftQueue } from "@/lib/db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";

export const STRUCTURE_TEMPLATES = [
  {
    id: "scene_first",
    label: "Scene opening",
    instruction: `Open with a specific scene or moment — a real situation, a meeting, 
a thing you noticed. One paragraph. Then develop the point. Close with what it means. 
Do NOT start with "I" as the first word.`,
  },
  {
    id: "counterintuitive",
    label: "Counterintuitive claim",
    instruction: `Open with the claim that contradicts the obvious take on this topic. 
No preamble. State it plainly in one sentence. Then show the evidence or reasoning. 
One-sentence close that restates the implication. Short post, under 180 words.`,
  },
  {
    id: "data_unpack",
    label: "Data unpack",
    instruction: `Open with the specific number or finding from the source — one sentence. 
Then unpack what it actually means, not what it says on the surface. 
Close in first person with what you would do differently because of it.`,
  },
  {
    id: "mid_thought",
    label: "Mid-thought entry",
    instruction: `Start mid-thought, as if continuing a conversation already in progress. 
No context-setting opener. Build the argument across 3-4 paragraphs of varying length. 
No explicit close — end on the observation, not a summary.`,
  },
  {
    id: "specific_mistake",
    label: "Specific mistake",
    instruction: `Open with a specific mistake, wrong assumption, or thing that surprised you. 
Real and named — not generic. Explain what changed. Do not moralize or generalize 
at the end. Keep it personal and specific throughout.`,
  },
] as const;

export type StructureTemplate = (typeof STRUCTURE_TEMPLATES)[number];

export async function selectStructureTemplate(userId: string): Promise<StructureTemplate> {
  const recent = await db
    .select({ structureTemplateId: draftQueue.structureTemplateId })
    .from(draftQueue)
    .where(
      and(
        eq(draftQueue.userId, userId),
        isNotNull(draftQueue.structureTemplateId),
      )
    )
    .orderBy(desc(draftQueue.generatedAt))
    .limit(2);

  const recentIds = recent
    .map((r) => r.structureTemplateId)
    .filter(Boolean) as string[];

  const available = STRUCTURE_TEMPLATES.filter(
    (t) => !recentIds.includes(t.id)
  );

  const pool = available.length > 0 ? available : [...STRUCTURE_TEMPLATES];

  return pool[Math.floor(Math.random() * pool.length)];
}
