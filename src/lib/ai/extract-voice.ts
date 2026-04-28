import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export interface ExtractedVoicePatterns {
  sentenceLength: "short" | "medium" | "long";
  hookStyle: "question" | "bold_claim" | "personal_story" | "data_point" | "contrarian";
  pov: "first_person_singular" | "first_person_plural" | "third_person";
  toneMarkers: string[];
  topicsObserved: string[];
  formattingStyle: "emoji_heavy" | "emoji_light" | "no_emoji";
  avgSentenceLengthWords: number | null;
  sentenceLengthRange: string | null;
  avgWordsPerPost: number | null;
  passiveVoiceRate: string | null;
  nominalizationRate: string | null;
  hedgingPhrases: string[];
  rhetoricalQuestionsRate: string | null;
  personalAnecdoteRate: string | null;
  dataCitationRate: string | null;
  paragraphStyle: "single_line" | "two_three_lines" | "multi_paragraph" | "mixed" | null;
  hookExamples: string[];
  neverPatterns: string[];
  postStructureTemplate: string | null;
  signaturePhrases: string[];
  generationGuidance: string | null;
  samplePostCount: number;
  calibrationQuality: "uncalibrated" | "partial" | "mostly" | "full";
  emojiContexts: string[];
  emojiExamples: string[];
  emojiFrequency: "none" | "rare" | "occasional" | "frequent" | null;
  listUsage: "rare" | "when_appropriate" | "frequent" | null;
}

function clampWord(value: number): "short" | "medium" | "long" {
  if (value < 15) return "short";
  if (value <= 25) return "medium";
  return "long";
}

function calibrationQualityFromCount(count: number): "uncalibrated" | "partial" | "mostly" | "full" {
  if (count <= 2) return "uncalibrated";
  if (count <= 5) return "partial";
  if (count <= 7) return "mostly";
  return "full";
}

export async function extractVoicePatterns(
  samplePosts: string[],
  context?: {
    userNotes?: string | null;
    userBannedWords?: string[] | null;
    toneMarkers?: string[] | null;
  },
): Promise<ExtractedVoicePatterns> {
  const client = getClient();
  const sampleCount = samplePosts.length;
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `You are a writing analyst. Analyse the provided LinkedIn posts and extract ONLY the
following measurements. Return a single JSON object - no prose, no markdown, no explanation.

{
  "avg_sentence_length_words": <integer - mean words per sentence across all posts>,
  "sentence_length_range": "<min>-<max> e.g. 5-22>",
  "avg_words_per_post": <integer>,
  "passive_voice_rate": "<percentage string e.g. ~8% of sentences>",
  "nominalization_rate": "low|medium|high",
  "hedging_phrases": ["<actual phrases found in posts e.g. I think, worth noting, in my experience>"],
  "rhetorical_questions_rate": <float - avg rhetorical questions per post>,
  "personal_anecdote_rate": <float - avg posts that include a personal story or experience, 0-1>,
  "data_citation_rate": <float - avg posts that cite a stat or study, 0-1>,
  "paragraph_style": "single_line|two_three_lines|multi_paragraph|mixed",
  "hook_examples": ["<copy the actual first line of up to 5 posts verbatim>"],
  "never_patterns": ["<things this writer never does e.g. never uses rhetorical questions, never ends with a CTA, never uses bullet points>"],
  "post_structure_template": "<prose description of the typical post structure e.g. Opens with a direct bold claim. Develops with 2-3 short paragraphs. Closes with a single takeaway sentence, no question.>",
  "signature_phrases": ["<2-3 word phrases that recur across posts - the writer's vocabulary fingerprint>"],
  "emoji_frequency": "none|rare|occasional|frequent",
  "emoji_contexts": ["<where emojis appear: sentence_starter, emphasis, closer>"],
  "emoji_examples": ["<actual emojis used>"],
  "list_usage": "rare|when_appropriate|frequent"
}

Posts to analyse:
${samplePosts.map((p, i) => `--- Post ${i + 1} ---\n${p}`).join("\n\n")}
`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();

  try {
    const pass1 = JSON.parse(clean) as {
      avg_sentence_length_words?: number;
      sentence_length_range?: string;
      avg_words_per_post?: number;
      passive_voice_rate?: string;
      nominalization_rate?: string;
      hedging_phrases?: string[];
      rhetorical_questions_rate?: number;
      personal_anecdote_rate?: number;
      data_citation_rate?: number;
      paragraph_style?: "single_line" | "two_three_lines" | "multi_paragraph" | "mixed";
      hook_examples?: string[];
      never_patterns?: string[];
      post_structure_template?: string;
      signature_phrases?: string[];
      emoji_frequency?: "none" | "rare" | "occasional" | "frequent";
      emoji_contexts?: string[];
      emoji_examples?: string[];
      list_usage?: "rare" | "when_appropriate" | "frequent";
    };

    const pass2 = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `You are synthesising a writing style guide for a LinkedIn ghostwriter.
Given the quantitative measurements below, write a concise prose guide (200-300 words)
that a language model can follow to write in this person's voice.

Structure it exactly as:

WRITING MEASUREMENTS:
[Translate numbers into natural language e.g. "Writes in short sentences, averaging 10 words. Range 5-18 words."]

STRUCTURE:
[Describe the typical post structure from post_structure_template]

HOOK PATTERNS - real examples from their posts:
[List hook_examples as bullet points]

VOCABULARY:
[List signature_phrases as the words/phrases this person naturally reaches for]

WHAT THIS WRITER NEVER DOES:
[List never_patterns - this is critical, follow it strictly]

TONE:
[Tone markers and any user notes]

NEVER USE THESE WORDS/PHRASES:
[user_banned_words]

Measurements:
${JSON.stringify(pass1)}

User notes: ${context?.userNotes ?? ""}
User banned words: ${(context?.userBannedWords ?? []).join(", ")}
Tone markers: ${(context?.toneMarkers ?? []).join(", ")}`,
        },
      ],
    });

    const pass2Text = pass2.content[0]?.type === "text" ? pass2.content[0].text.trim() : null;
    const avgSentence = pass1.avg_sentence_length_words ?? null;
    const emojiFrequency = pass1.emoji_frequency ?? null;

    return {
      sentenceLength: avgSentence ? clampWord(avgSentence) : "medium",
      hookStyle: "bold_claim",
      pov: "first_person_singular",
      toneMarkers: context?.toneMarkers ?? [],
      topicsObserved: [],
      formattingStyle: emojiFrequency === "frequent" ? "emoji_heavy" : emojiFrequency === "none" ? "no_emoji" : "emoji_light",
      avgSentenceLengthWords: avgSentence,
      sentenceLengthRange: pass1.sentence_length_range ?? null,
      avgWordsPerPost: pass1.avg_words_per_post ?? null,
      passiveVoiceRate: pass1.passive_voice_rate ?? null,
      nominalizationRate: pass1.nominalization_rate ?? null,
      hedgingPhrases: pass1.hedging_phrases ?? [],
      rhetoricalQuestionsRate: pass1.rhetorical_questions_rate != null ? String(pass1.rhetorical_questions_rate) : null,
      personalAnecdoteRate: pass1.personal_anecdote_rate != null ? String(pass1.personal_anecdote_rate) : null,
      dataCitationRate: pass1.data_citation_rate != null ? String(pass1.data_citation_rate) : null,
      paragraphStyle: pass1.paragraph_style ?? null,
      hookExamples: pass1.hook_examples ?? [],
      neverPatterns: pass1.never_patterns ?? [],
      postStructureTemplate: pass1.post_structure_template ?? null,
      signaturePhrases: pass1.signature_phrases ?? [],
      generationGuidance: pass2Text,
      samplePostCount: sampleCount,
      calibrationQuality: calibrationQualityFromCount(sampleCount),
      emojiContexts: pass1.emoji_contexts ?? [],
      emojiExamples: pass1.emoji_examples ?? [],
      emojiFrequency,
      listUsage: pass1.list_usage ?? null,
    };
  } catch {
    throw new Error(`Voice extraction returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
