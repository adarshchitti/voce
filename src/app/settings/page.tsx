"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { SchedulingForm, type SchedulingSettings } from "@/components/SchedulingForm";
import { cn } from "@/lib/utils";

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
  const [activeSection, setActiveSection] = useState<"voice" | "topics" | "scheduling" | "linkedin">("voice");
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

  useEffect(() => {
    const sectionIds = ["voice", "topics", "scheduling", "linkedin"] as const;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.id as typeof sectionIds[number];
        setActiveSection(id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
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
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#111827]">Settings</h1>
        <p className="mt-0.5 text-[13px] text-[#6B7280]">Manage voice, topics, scheduling, and LinkedIn connection</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="sticky top-6 hidden self-start lg:block">
          <div className="space-y-1 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
            {[
              { id: "voice", label: "Voice Profile" },
              { id: "topics", label: "Topics" },
              { id: "scheduling", label: "Scheduling" },
              { id: "linkedin", label: "LinkedIn" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  activeSection === item.id
                    ? "bg-[#EFF6FF] font-medium text-[#2563EB]"
                    : "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          <section id="voice" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Voice Profile</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">How your posts should sound</p>
            </div>

            <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <div className="flex items-center justify-between rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      calibrationQuality === "full" && "bg-[#16A34A]",
                      (calibrationQuality === "mostly" || calibrationQuality === "partial") && "bg-[#D97706]",
                      calibrationQuality === "uncalibrated" && "bg-[#DC2626]",
                    )}
                  />
                  <span className="text-[13px] font-medium text-[#111827]">Voice {calibrationUi.label}</span>
                  <span className="text-[12px] text-[#6B7280]">
                    {sampleCount} sample post{sampleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="hidden text-[12px] text-[#6B7280] md:block">{calibrationUi.nudge}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Sample posts</label>
                <p className="text-[12px] text-[#9CA3AF]">Paste 8+ of your best LinkedIn posts. Separate each post with a blank line.</p>
                <textarea
                  rows={8}
                  value={samplePostsText}
                  onChange={(e) => setSamplePostsText(e.target.value)}
                  className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Raw description</label>
                  <p className="text-[12px] text-[#9CA3AF]">Short plain-English description of your writing style</p>
                  <textarea
                    rows={3}
                    value={rawDescription}
                    onChange={(e) => setRawDescription(e.target.value)}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Tone markers</label>
                  <p className="text-[12px] text-[#9CA3AF]">Comma-separated tone keywords</p>
                  <input
                    value={toneMarkers.join(", ")}
                    onChange={(e) =>
                      setToneMarkers(
                        e.target.value
                          .split(",")
                          .map((m) => m.trim())
                          .filter(Boolean),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Banned words</label>
                  <p className="text-[12px] text-[#9CA3AF]">Comma-separated words/phrases to avoid</p>
                  <input
                    value={userBannedWordsText}
                    onChange={(e) => setUserBannedWordsText(e.target.value)}
                    className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">User notes</label>
                  <p className="text-[12px] text-[#9CA3AF]">Additional instructions for style constraints</p>
                  <textarea
                    rows={2}
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-medium text-[#374151]">Personal context</label>
                  <p className="text-[12px] text-[#9CA3AF]">Used by the personal-angle draft enhancement</p>
                  <textarea
                    rows={2}
                    value={personalContext}
                    onChange={(e) => setPersonalContext(e.target.value)}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-[#6B7280] hover:text-[#374151]">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  Extracted voice patterns
                </summary>
                <div className="mt-3 space-y-4 pl-5">
                  {isCalibrated && extractedPatterns ? (
                    <div className="grid grid-cols-1 gap-2 text-[12px] text-[#6B7280] md:grid-cols-2">
                      <div><span className="text-[#9CA3AF]">Sentences:</span> {extractedPatterns.sentenceLength}</div>
                      <div><span className="text-[#9CA3AF]">Hook style:</span> {extractedPatterns.hookStyle}</div>
                      <div><span className="text-[#9CA3AF]">POV:</span> {extractedPatterns.pov}</div>
                      <div><span className="text-[#9CA3AF]">Format:</span> {extractedPatterns.formattingStyle}</div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-[#6B7280]">Signature phrases</p>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {signaturePhrases.map((phrase) => (
                        <button
                          key={phrase}
                          onClick={async () => {
                            const next = signaturePhrases.filter((p) => p !== phrase);
                            setSignaturePhrases(next);
                            await patchVoiceOverrides({ signaturePhrases: next });
                          }}
                          className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] text-[#6B7280]"
                        >
                          {phrase} ×
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newSignaturePhrase}
                        onChange={(e) => setNewSignaturePhrase(e.target.value)}
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[12px]"
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
                        className="h-8 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-[#6B7280]">Never patterns</p>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {neverPatterns.map((pattern) => (
                        <button
                          key={pattern}
                          onClick={async () => {
                            const next = neverPatterns.filter((p) => p !== pattern);
                            setNeverPatterns(next);
                            await patchVoiceOverrides({ neverPatterns: next });
                          }}
                          className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] text-[#6B7280]"
                        >
                          {pattern} ×
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newNeverPattern}
                        onChange={(e) => setNewNeverPattern(e.target.value)}
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[12px]"
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
                        className="h-8 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-[#6B7280]">Structure template</label>
                    <textarea
                      rows={3}
                      value={postStructureTemplate}
                      onChange={(e) => setPostStructureTemplate(e.target.value)}
                      onBlur={() => patchVoiceOverrides({ postStructureTemplate })}
                      className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-[12px]"
                    />
                  </div>
                </div>
              </details>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[13px] font-medium text-[#374151]">Never use emojis</p>
                  <p className="text-[12px] text-[#9CA3AF]">Override all emoji generation</p>
                </div>
                <input
                  type="checkbox"
                  checked={emojiNeverOverride}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setEmojiNeverOverride(next);
                    await patchVoiceOverrides({ emojiNeverOverride: next });
                  }}
                />
              </div>

              <div className="border-t border-[#E5E7EB] pt-4">
                <p className="mb-3 text-[12px] text-[#6B7280]">Content style scanner preferences</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[
                      { value: "always", label: "Always flag" },
                      { value: "three_plus", label: "Flag if >3 items" },
                      { value: "never", label: "Never flag" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTellFlagNumberedLists(opt.value as "always" | "three_plus" | "never")}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-[12px] transition-colors",
                          tellFlagNumberedLists === opt.value
                            ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                            : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {[
                    { key: "tellFlagBannedWords", label: "Banned words" },
                    { key: "tellFlagEmDash", label: "Em dash overuse" },
                    { key: "tellFlagEngagementBeg", label: "Engagement begs" },
                    { key: "tellFlagEveryLine", label: "Every-line-break format" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between border-b border-[#E5E7EB] py-2 last:border-0">
                      <p className="text-[13px] text-[#374151]">{item.label}</p>
                      <button
                        onClick={() => toggleTellFlag(item.key as keyof typeof tellFlags)}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          tellFlags[item.key as keyof typeof tellFlags] ? "bg-[#2563EB]" : "bg-[#E5E7EB]",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                            tellFlags[item.key as keyof typeof tellFlags] ? "translate-x-4" : "translate-x-1",
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={saveOverrides}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
              >
                Save Voice Overrides
              </button>
              <button
                onClick={handleSaveTellSettings}
                disabled={savingTellSettings}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] disabled:opacity-50"
              >
                Save Style Preferences
              </button>
              <button
                onClick={saveVoice}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Save Voice Profile
              </button>
            </div>
          </section>

          <section id="topics" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Topics</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">What you want to post about</p>
            </div>
            <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              {topics.map((topic, i) => (
                <div
                  key={topic.id ?? i}
                  className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4 transition-colors hover:border-[#D1D5DB]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                      <span className="text-[13.5px] font-medium text-[#111827]">{topic.topicLabel || "Untitled topic"}</span>
                    </div>
                    {topics.length > 1 ? (
                      <button
                        onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))}
                        className="text-[#9CA3AF] transition-colors hover:text-[#DC2626]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Topic label</label>
                      <input
                        type="text"
                        value={topic.topicLabel}
                        onChange={(e) => updateTopic(i, "topicLabel", e.target.value)}
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Search query</label>
                        {topic.topicLabel.trim() &&
                        (!topic.tavilyQuery.trim() || topic.topicLabel.trim() !== (topic.lastSavedTopicLabel ?? "").trim()) ? (
                          <button
                            type="button"
                            onClick={() => suggestTopicQuery(i)}
                            disabled={suggestingTopicIndex === i}
                            className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline disabled:opacity-50"
                          >
                            {suggestingTopicIndex === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Suggest
                          </button>
                        ) : null}
                      </div>
                      <input
                        type="text"
                        value={topic.tavilyQuery}
                        onChange={(e) => {
                          updateTopic(i, "tavilyQuery", e.target.value);
                          updateTopic(i, "querySuggested", false);
                        }}
                        className={cn(
                          "h-8 w-full rounded-md border px-3 text-[13px]",
                          topic.querySuggested ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#E5E7EB] bg-white",
                        )}
                      />
                      {topic.querySuggested ? <p className="text-[11px] text-[#D97706]">AI suggested - edit if needed</p> : null}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Source URLs</label>
                      <input
                        value={topic.sourceUrls.join(", ")}
                        onChange={(e) =>
                          updateTopic(
                            i,
                            "sourceUrls",
                            e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="https://example.com/feed, ..."
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                      />
                      <p className="text-[11px] text-[#9CA3AF]">RSS feeds or blogs, comma separated</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[#6B7280]">Priority</span>
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
                              if (!response.ok) showToast("Failed to update priority", "error");
                            }}
                            className={cn(
                              "h-7 w-7 rounded-md border text-[12px] transition-colors",
                              (topic.priorityWeight ?? 3) === weight
                                ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                                : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]",
                            )}
                          >
                            {weight}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => saveTopicRow(i)}
                      className="h-7 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                    >
                      Save
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
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <Plus className="h-4 w-4" />
                  Add topic
                </button>
              ) : null}
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveTopics}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Save Topics
              </button>
            </div>
          </section>

          <section id="scheduling" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Scheduling</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">When approved posts are published</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <SchedulingForm initialSettings={schedulingSettings} />
            </div>
          </section>

          <section id="linkedin" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">LinkedIn</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">Connection status for publishing</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              {!linkedinToken ? (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn not connected</p>
                      <p className="text-[12px] text-[#6B7280]">Connect to enable publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md bg-[#DC2626] px-3 text-[12px] font-medium leading-8 text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    Connect
                  </a>
                </div>
              ) : linkedinToken.status === "active" ? (
                <div className="flex items-center justify-between rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0077B5]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn connected</p>
                      <p className="text-[12px] text-[#6B7280]">
                        Token expires {formatDistanceToNow(new Date(linkedinToken.tokenExpiry), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] leading-8 text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                  >
                    Reconnect
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn token expired</p>
                      <p className="text-[12px] text-[#6B7280]">Reconnect to resume publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md bg-[#DC2626] px-3 text-[12px] font-medium leading-8 text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    Reconnect now
                  </a>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
