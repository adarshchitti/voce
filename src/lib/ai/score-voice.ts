import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export interface VoiceScoreDetails {
  score: number;
  flags: string[];
}

export async function scoreVoiceDetailed(input: { voiceProfile: unknown; draftText: string }): Promise<VoiceScoreDetails> {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: "You are a voice consistency checker. Respond ONLY with valid JSON. No preamble.",
    messages: [
      {
        role: "user",
        content: `Score this LinkedIn draft against the user's voice profile. Return JSON only.

{
  "score": <integer 1-10>,
  "dimensions": {
    "sentence_length_match": <0-2.5 - does avg sentence length match profile? Profile avg: dynamic words>,
    "structure_match": <0-2.5 - does post structure follow post_structure_template?>,
    "hook_match": <0-2.5 - does the hook match the user's observed hook patterns?>,
    "vocabulary_match": <0-2.5 - does the draft use vocabulary consistent with signature_phrases and avoid banned patterns?>
  },
  "flags": ["<specific things that don't match the voice profile>"]
}

Voice profile summary:
${JSON.stringify(input.voiceProfile)}

Draft post to score:
${input.draftText}
`,
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();
  const parsed = JSON.parse(clean) as {
    score?: number;
    dimensions?: Record<string, number>;
    flags?: string[];
  };
  const fromDimensions = parsed.dimensions
    ? Object.values(parsed.dimensions).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
    : 0;
  const rawScore = parsed.score ?? fromDimensions;
  return {
    score: Math.max(1, Math.min(10, Math.round(rawScore))),
    flags: parsed.flags ?? [],
  };
}

export async function scoreVoice(input: { extractedPatterns: unknown; draftText: string }) {
  const detailed = await scoreVoiceDetailed({ voiceProfile: input.extractedPatterns, draftText: input.draftText });
  return detailed.score;
}
