import Anthropic from "@anthropic-ai/sdk";
import {
  AI_TELL_SCAN_PROMPT,
  DEFAULT_SENSITIVITY,
  type SensitivitySettings,
} from "@/lib/ai/ai-tells";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export interface ScanResult {
  flaggedWords: string[];
  structureIssues: string[];
  clean: boolean;
}

export async function scanDraftForAITells(
  draftText: string,
  sensitivity: SensitivitySettings = DEFAULT_SENSITIVITY,
  calibration?: {
    paragraphStyle?: string | null;
    listUsage?: string | null;
    usesEmDash?: boolean | null;
  },
): Promise<ScanResult> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: "You are a content quality checker. Return only valid JSON. No preamble.",
      messages: [
        {
          role: "user",
          content: AI_TELL_SCAN_PROMPT(draftText, sensitivity, calibration),
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();

    return JSON.parse(clean) as ScanResult;
  } catch {
    // Scan failure must never block draft generation
    // Return clean result so the draft still appears in inbox
    console.error("AI tell scan failed — returning clean result as fallback");
    return { flaggedWords: [], structureIssues: [], clean: true };
  }
}
