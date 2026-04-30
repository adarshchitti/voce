"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/Toast";
import { SchedulingForm, type SchedulingSettings } from "@/components/SchedulingForm";

interface LinkedInTokenView {
  status: "active" | "expired" | string;
  personUrn: string;
  tokenExpiry: string;
}

interface TopicRow {
  id?: string;
  topicLabel: string;
  tavilyQuery: string;
  sourceUrls: string[];
  priorityWeight: number;
  lastSavedTopicLabel?: string;
  querySuggested?: boolean;
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [rawDescription, setRawDescription] = useState("");
  const [personalContext, setPersonalContext] = useState("");
  const [samplePostsText, setSamplePostsText] = useState("");
  const [sentenceLength, setSentenceLength] = useState<string | null>(null);
  const [hookStyle, setHookStyle] = useState<string | null>(null);
  const [pov, setPov] = useState<string | null>(null);
  const [toneMarkers, setToneMarkers] = useState<string[]>([]);
  const [formattingStyle, setFormattingStyle] = useState<string | null>(null);
  const [calibrationQuality, setCalibrationQuality] = useState<string>("uncalibrated");
  const [samplePostCount, setSamplePostCount] = useState(0);
  const [signaturePhrases, setSignaturePhrases] = useState<string[]>([]);
  const [neverPatterns, setNeverPatterns] = useState<string[]>([]);
  const [postStructureTemplate, setPostStructureTemplate] = useState("");
  const [emojiNeverOverride, setEmojiNeverOverride] = useState(false);
  const [newSignaturePhrase, setNewSignaturePhrase] = useState("");
  const [newNeverPattern, setNewNeverPattern] = useState("");
  const [userBannedWordsText, setUserBannedWordsText] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [linkedinToken, setLinkedinToken] = useState<LinkedInTokenView | null>(null);
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings>({
    cadenceMode: "daily",
    draftsPerDay: 3,
    preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
    preferredTime: "09:00",
    timezone: "America/New_York",
    jitterMinutes: 15,
  });
  const [tellFlagNumberedLists, setTellFlagNumberedLists] = useState<"always" | "three_plus" | "never">("three_plus");
  const [tellFlags, setTellFlags] = useState({
    tellFlagBannedWords: true,
    tellFlagEmDash: true,
    tellFlagEngagementBeg: true,
    tellFlagEveryLine: true,
  });
  const [savingTellSettings, setSavingTellSettings] = useState(false);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [suggestingTopicIndex, setSuggestingTopicIndex] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/voice").then((r) => r.json()).then((d) => {
      setRawDescription(d.voiceProfile?.rawDescription ?? "");
      setSamplePostsText((d.voiceProfile?.samplePosts ?? []).join("\n---\n"));
      setSentenceLength(d.voiceProfile?.sentenceLength ?? null);
      setHookStyle(d.voiceProfile?.hookStyle ?? null);
      setPov(d.voiceProfile?.pov ?? null);
      setToneMarkers(d.voiceProfile?.toneMarkers ?? []);
      setFormattingStyle(d.voiceProfile?.formattingStyle ?? null);
      setCalibrationQuality(d.voiceProfile?.calibrationQuality ?? "uncalibrated");
      setSamplePostCount(d.voiceProfile?.samplePostCount ?? 0);
      setSignaturePhrases(d.voiceProfile?.signaturePhrases ?? []);
      setNeverPatterns(d.voiceProfile?.neverPatterns ?? []);
      setPostStructureTemplate(d.voiceProfile?.postStructureTemplate ?? "");
      setEmojiNeverOverride(d.voiceProfile?.emojiNeverOverride ?? false);
      setUserBannedWordsText((d.voiceProfile?.userBannedWords ?? []).join(", "));
      setUserNotes(d.voiceProfile?.userNotes ?? "");
      setPersonalContext(d.voiceProfile?.personalContext ?? "");
    });

    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => {
        const existingTopics = (d.topics ?? []) as TopicRow[];
        setTopics(
          existingTopics.length > 0
            ? existingTopics.map((topic) => ({
                id: topic.id,
                topicLabel: topic.topicLabel ?? "",
                tavilyQuery: topic.tavilyQuery ?? "",
                sourceUrls: topic.sourceUrls ?? [],
                priorityWeight: topic.priorityWeight ?? 3,
                lastSavedTopicLabel: topic.topicLabel ?? "",
                querySuggested: false,
              }))
            : [{ topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3, lastSavedTopicLabel: "", querySuggested: false }],
        );
      });

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLinkedinToken((d.linkedinToken ?? null) as LinkedInTokenView | null);
        setSchedulingSettings({
          cadenceMode: d.settings?.cadenceMode ?? "daily",
          draftsPerDay: d.settings?.draftsPerDay ?? 3,
          preferredDays: d.settings?.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"],
          preferredTime: d.settings?.preferredTime ?? "09:00",
          timezone: d.settings?.timezone ?? "America/New_York",
          jitterMinutes: d.settings?.jitterMinutes ?? 15,
        });
        setTellFlagNumberedLists(d.settings?.tellFlagNumberedLists ?? "three_plus");
        setTellFlags({
          tellFlagBannedWords: d.settings?.tellFlagBannedWords ?? true,
          tellFlagEmDash: d.settings?.tellFlagEmDash ?? true,
          tellFlagEngagementBeg: d.settings?.tellFlagEngagementBeg ?? true,
          tellFlagEveryLine: d.settings?.tellFlagEveryLine ?? true,
        });
      })
      .catch(() => setLinkedinToken(null));
  }, []);

  async function saveVoice() {
    const samplePosts = samplePostsText
      .split("---")
      .map((p) => p.trim())
      .filter(Boolean);
    const response = await fetch("/api/voice", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawDescription, samplePosts, personalContext }),
    });
    showToast(response.ok ? "Voice profile saved" : "Failed to save", response.ok ? "success" : "error");
  }

  const updateTopic = (index: number, field: keyof TopicRow, value: string | string[] | number | boolean | undefined) => {
    setTopics((prev) => prev.map((topic, i) => (i === index ? { ...topic, [field]: value } : topic)));
  };

  async function patchTopicById(topicId: string, payload: Partial<Pick<TopicRow, "topicLabel" | "tavilyQuery" | "sourceUrls" | "priorityWeight">>) {
    // Topic updates route path: /api/topics?id=<topicId>
    const response = await fetch(`/api/topics?id=${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    console.log("PATCH /api/topics response", { ok: response.ok, status: response.status, data });
    return { response, data };
  }

  async function saveTopicRow(index: number): Promise<boolean> {
    const topic = topics[index];
    if (!topic) return false;

    const payload = {
      topicLabel: topic.topicLabel.trim(),
      tavilyQuery: topic.tavilyQuery.trim(),
      sourceUrls: topic.sourceUrls.map((url) => url.trim()).filter(Boolean),
      priorityWeight: topic.priorityWeight ?? 3,
    };

    if (!payload.topicLabel || !payload.tavilyQuery) {
      showToast("Topic name and query are required", "error");
      return false;
    }

    if (topic.id) {
      const { response, data } = await patchTopicById(topic.id, payload);
      if (!response.ok) {
        showToast("Failed to save topic", "error");
        console.log("Topic save error payload", data);
        return false;
      }
      setTopics((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                ...(data.topic ?? {}),
                topicLabel: data.topic?.topicLabel ?? payload.topicLabel,
                tavilyQuery: data.topic?.tavilyQuery ?? payload.tavilyQuery,
                sourceUrls: data.topic?.sourceUrls ?? payload.sourceUrls,
                priorityWeight: data.topic?.priorityWeight ?? payload.priorityWeight,
                lastSavedTopicLabel: data.topic?.topicLabel ?? payload.topicLabel,
              }
            : row,
        ),
      );
      showToast("Topic saved");
      return true;
    }

    const createResponse = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicLabel: payload.topicLabel,
        tavilyQuery: payload.tavilyQuery,
        sourceUrls: payload.sourceUrls,
        priorityWeight: payload.priorityWeight,
        tavilyQueryConfirmed: true,
      }),
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      showToast("Failed to save topic", "error");
      console.log("POST /api/topics response", { ok: createResponse.ok, status: createResponse.status, data: createData });
      return false;
    }
    setTopics((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              id: createData.topic?.id ?? row.id,
              lastSavedTopicLabel: createData.topic?.topicLabel ?? payload.topicLabel,
              priorityWeight: createData.topic?.priorityWeight ?? payload.priorityWeight,
            }
          : row,
      ),
    );
    showToast("Topic saved");
    return true;
  }

  async function suggestTopicQuery(index: number) {
    const topic = topics[index];
    if (!topic?.topicLabel.trim()) return;
    setSuggestingTopicIndex(index);
    try {
      const response = await fetch("/api/topics/suggest-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicLabel: topic.topicLabel.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.suggestedQuery) {
        throw new Error("suggestion_failed");
      }
      setTopics((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, tavilyQuery: data.suggestedQuery, querySuggested: true } : row,
        ),
      );
    } catch {
      showToast("Couldn't suggest a query — try typing one manually", "error");
    } finally {
      setSuggestingTopicIndex(null);
    }
  }

  async function saveTopics() {
    const operations = topics.map(async (topic, index) => {
      const trimmedLabel = topic.topicLabel.trim();
      const trimmedQuery = topic.tavilyQuery.trim();
      if (!trimmedLabel || !trimmedQuery) return true;
      return saveTopicRow(index);
    });
    const results = await Promise.all(operations);
    if (results.every(Boolean)) {
      showToast("Topics saved");
    } else {
      showToast("Failed to save", "error");
    }
  }

  async function saveOverrides() {
    const userBannedWords = userBannedWordsText
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    const response = await fetch("/api/voice/overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userBannedWords,
        userNotes: userNotes.trim() ? userNotes : "",
      }),
    });
    showToast(response.ok ? "Preferences saved" : "Failed to save", response.ok ? "success" : "error");
  }

  async function patchVoiceOverrides(payload: {
    signaturePhrases?: string[];
    neverPatterns?: string[];
    postStructureTemplate?: string;
    emojiNeverOverride?: boolean;
  }) {
    const response = await fetch("/api/voice/overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      showToast("Failed to save", "error");
    }
  }

  const toggleTellFlag = (key: keyof typeof tellFlags) => {
    setTellFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function handleSaveTellSettings() {
    setSavingTellSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tellFlagNumberedLists,
          tellFlagBannedWords: tellFlags.tellFlagBannedWords,
          tellFlagEmDash: tellFlags.tellFlagEmDash,
          tellFlagEngagementBeg: tellFlags.tellFlagEngagementBeg,
          tellFlagEveryLine: tellFlags.tellFlagEveryLine,
        }),
      });
      showToast(response.ok ? "Content style preferences saved" : "Failed to save", response.ok ? "success" : "error");
    } finally {
      setSavingTellSettings(false);
    }
  }

  const sampleCount = samplePostCount || samplePostsText
    .split("---")
    .map((p) => p.trim())
    .filter(Boolean).length;
  const isCalibrated = sampleCount >= 3 && !!sentenceLength && !!hookStyle && !!pov && !!formattingStyle;
  const extractedPatterns =
    sentenceLength && hookStyle && pov && formattingStyle
      ? { sentenceLength, hookStyle, pov, formattingStyle, toneMarkers }
      : null;

  const calibrationUi =
    calibrationQuality === "full"
      ? { label: "FULL ✓", className: "bg-green-100 text-green-700", nudge: "Voice fully calibrated. Add posts anytime to keep it current." }
      : calibrationQuality === "mostly"
        ? { label: "MOSTLY ◐", className: "bg-amber-100 text-amber-700", nudge: "Almost there - add 1-2 more posts to reach full calibration." }
        : calibrationQuality === "partial"
          ? { label: "PARTIAL ◑", className: "bg-amber-100 text-amber-700", nudge: "Add more posts for better accuracy. 8+ posts recommended." }
          : { label: "UNCALIBRATED ○", className: "bg-red-100 text-red-700", nudge: "Add at least 3 posts to start calibrating your voice." };

  return (
    <div className="space-y-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      </div>

      <SettingsSection title="LinkedIn" description="Connect your account to enable publishing">
        {!linkedinToken ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">No account connected</p>
              <p className="mt-0.5 text-xs text-slate-400">Required to publish posts</p>
            </div>
            <a
              href="/api/auth/linkedin"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Connect LinkedIn
            </a>
          </div>
        ) : null}

        {linkedinToken && linkedinToken.status === "active" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
                <span className="text-sm font-bold text-white">in</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">LinkedIn connected</p>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Expires {formatDistanceToNow(new Date(linkedinToken.tokenExpiry), { addSuffix: true })}
                  {" · "}
                  <span className="font-mono text-slate-300">
                    {linkedinToken.personUrn.replace("urn:li:person:", "").slice(0, 8)}...
                  </span>
                </p>
              </div>
            </div>
            <a
              href="/api/auth/linkedin"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              Reconnect
            </a>
          </div>
        ) : null}

        {linkedinToken && linkedinToken.status !== "active" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <span className="text-sm font-bold text-red-600">in</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">LinkedIn disconnected</p>
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Expired</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Posts will not publish until reconnected</p>
              </div>
            </div>
            <a
              href="/api/auth/linkedin"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Reconnect
            </a>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Voice Profile" description="Help the AI write in your style">
        <div className="mb-4 space-y-2">
          <p className="text-sm text-slate-700">
            Voice calibration: <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${calibrationUi.className}`}>{calibrationUi.label}</span>
          </p>
          <p className="text-xs text-slate-500">{sampleCount} sample posts added · <span className="text-blue-600">Add more posts ↗</span></p>
          <p className="text-xs text-slate-500">{calibrationUi.nudge}</p>
        </div>

        {isCalibrated && extractedPatterns ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Extracted patterns</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
              <div><span className="text-slate-400">Sentences:</span> {extractedPatterns.sentenceLength}</div>
              <div><span className="text-slate-400">Hook style:</span> {extractedPatterns.hookStyle}</div>
              <div><span className="text-slate-400">POV:</span> {extractedPatterns.pov}</div>
              <div><span className="text-slate-400">Format:</span> {extractedPatterns.formattingStyle}</div>
              {extractedPatterns.toneMarkers?.length > 0 ? (
                <div className="col-span-2"><span className="text-slate-400">Tone:</span> {extractedPatterns.toneMarkers.join(", ")}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Style description</label>
            <textarea
              className="h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={rawDescription}
              onChange={(e) => setRawDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Sample posts (split by ---)</label>
            <textarea
              className="h-40 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={samplePostsText}
              onChange={(e) => setSamplePostsText(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Personal context
              <span className="ml-1 text-xs font-normal text-slate-400">
                - used when "Add personal angle" is triggered on a draft
              </span>
            </label>
            <textarea
              value={personalContext}
              onChange={(e) => setPersonalContext(e.target.value)}
              placeholder="Describe your background, current projects, and experiences that are relevant to your posts. E.g. 'Junior CS student doing agentic AI research, interning at Klaviyo...'"
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={saveVoice} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-green-700">
            Save voice
          </button>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Your signature phrases (from your posts)</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {signaturePhrases.map((phrase) => (
                <button
                  key={phrase}
                  onClick={async () => {
                    const next = signaturePhrases.filter((p) => p !== phrase);
                    setSignaturePhrases(next);
                    await patchVoiceOverrides({ signaturePhrases: next });
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                >
                  {phrase} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newSignaturePhrase}
                onChange={(e) => setNewSignaturePhrase(e.target.value)}
                placeholder="Add phrase"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  const phrase = newSignaturePhrase.trim();
                  if (!phrase) return;
                  const next = [...signaturePhrases, phrase];
                  setSignaturePhrases(next);
                  setNewSignaturePhrase("");
                  await patchVoiceOverrides({ signaturePhrases: next });
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                + Add phrase
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Patterns this writer avoids - edit if wrong</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {neverPatterns.map((pattern) => (
                <button
                  key={pattern}
                  onClick={async () => {
                    const next = neverPatterns.filter((p) => p !== pattern);
                    setNeverPatterns(next);
                    await patchVoiceOverrides({ neverPatterns: next });
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                >
                  {pattern} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newNeverPattern}
                onChange={(e) => setNewNeverPattern(e.target.value)}
                placeholder="Add pattern"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  const pattern = newNeverPattern.trim();
                  if (!pattern) return;
                  const next = [...neverPatterns, pattern];
                  setNeverPatterns(next);
                  setNewNeverPattern("");
                  await patchVoiceOverrides({ neverPatterns: next });
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                + Add pattern
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Typical post structure (extracted - edit to correct)</label>
            <textarea
              value={postStructureTemplate}
              onChange={(e) => setPostStructureTemplate(e.target.value)}
              onBlur={() => patchVoiceOverrides({ postStructureTemplate })}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={emojiNeverOverride}
              onChange={async (e) => {
                const next = e.target.checked;
                setEmojiNeverOverride(next);
                await patchVoiceOverrides({ emojiNeverOverride: next });
              }}
            />
            Never use emojis in generated posts
          </label>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Words/phrases to never use</label>
            <input
              value={userBannedWordsText}
              onChange={(e) => setUserBannedWordsText(e.target.value)}
              placeholder="synergy, leverage, circle back, game-changer"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Additional voice notes</label>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="I never use bullet lists. I always write in first person. I avoid exclamation marks."
              className="h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={saveOverrides}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50"
          >
            Save voice overrides
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Topics & Sources" description="What you want to post about — used to find relevant articles daily">
        <div className="space-y-3">
          {topics.map((topic, i) => (
            <div key={topic.id ?? i} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Topic {i + 1}</span>
                {topics.length > 1 ? (
                  <button
                    onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Topic name</label>
                  <input
                    type="text"
                    value={topic.topicLabel}
                    onChange={(e) => updateTopic(i, "topicLabel", e.target.value)}
                    placeholder="e.g. Agentic AI"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-600" title="Higher priority = more drafts generated from this topic">
                      Priority
                    </label>
                    <span className="text-xs text-slate-400">Higher priority = more drafts generated from this topic</span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((weight) => (
                      <button
                        key={weight}
                        type="button"
                        onClick={async () => {
                          updateTopic(i, "priorityWeight", weight);
                          const topicId = topics[i]?.id;
                          if (!topicId) return;
                          const { response } = await patchTopicById(topicId, { priorityWeight: weight });
                          if (!response.ok) {
                            showToast("Failed to update priority", "error");
                          }
                        }}
                        className={`h-7 w-7 rounded-sm border text-xs transition-colors ${
                          (topic.priorityWeight ?? 3) === weight
                            ? "bg-primary text-primary-foreground"
                            : "border-slate-200 bg-background hover:bg-accent"
                        }`}
                      >
                        {weight}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Search query
                    <span className="ml-1 font-normal text-slate-400">— what to search for on the web</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={topic.tavilyQuery}
                      onChange={(e) => {
                        updateTopic(i, "tavilyQuery", e.target.value);
                        updateTopic(i, "querySuggested", false);
                      }}
                      placeholder="e.g. agentic AI systems 2025"
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        topic.querySuggested ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
                      }`}
                    />
                    {topic.topicLabel.trim() &&
                    (!topic.tavilyQuery.trim() || topic.topicLabel.trim() !== (topic.lastSavedTopicLabel ?? "").trim()) ? (
                      <button
                        type="button"
                        onClick={() => suggestTopicQuery(i)}
                        disabled={suggestingTopicIndex === i}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        {suggestingTopicIndex === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Suggest query
                      </button>
                    ) : null}
                  </div>
                  {topic.querySuggested ? (
                    <p className="mt-1 text-xs text-amber-600">AI suggested — edit if needed</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    RSS feeds
                    <span className="ml-1 font-normal text-slate-400">— optional, one URL per line</span>
                  </label>
                  <textarea
                    value={topic.sourceUrls.join("\n")}
                    onChange={(e) =>
                      updateTopic(
                        i,
                        "sourceUrls",
                        e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="https://example.com/feed"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => saveTopicRow(i)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  Save topic
                </button>
              </div>
            </div>
          ))}

          {topics.length < 5 ? (
            <button
              onClick={() =>
                setTopics((prev) => [
                  ...prev,
                  { topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3, lastSavedTopicLabel: "", querySuggested: false },
                ])
              }
              className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
            >
              + Add topic
            </button>
          ) : null}

          <button
            onClick={saveTopics}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50"
          >
            Save topics
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Scheduling" description="When approved posts are published">
        <SchedulingForm initialSettings={schedulingSettings} />
      </SettingsSection>

      <SettingsSection
        title="Content style preferences"
        description="Control which patterns the AI tell scanner flags in your drafts"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Numbered lists</label>
            <div className="flex gap-2">
              {[
                { value: "always", label: "Always flag" },
                { value: "three_plus", label: "Flag if >3 items" },
                { value: "never", label: "Never flag" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTellFlagNumberedLists(opt.value as "always" | "three_plus" | "never")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    tellFlagNumberedLists === opt.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Default: flag only if more than 3 items - short numbered comparisons are fine
            </p>
          </div>

          {[
            { key: "tellFlagBannedWords", label: "Banned words", desc: "delve, leverage, ecosystem etc" },
            { key: "tellFlagEmDash", label: "Em dash overuse", desc: "more than one em dash per post" },
            {
              key: "tellFlagEngagementBeg",
              label: "Engagement begs",
              desc: '"what do you think? drop a comment"',
            },
            { key: "tellFlagEveryLine", label: "Every-line-break format", desc: "each sentence on its own line" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
              <button
                onClick={() => toggleTellFlag(item.key as keyof typeof tellFlags)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  tellFlags[item.key as keyof typeof tellFlags] ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    tellFlags[item.key as keyof typeof tellFlags] ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveTellSettings}
              disabled={savingTellSettings}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {savingTellSettings ? "Saving..." : "Save preferences"}
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
