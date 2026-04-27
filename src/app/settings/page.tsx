"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
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
  const [topics, setTopics] = useState<TopicRow[]>([]);
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
              }))
            : [{ topicLabel: "", tavilyQuery: "", sourceUrls: [] }],
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

  const updateTopic = (index: number, field: keyof TopicRow, value: string | string[]) => {
    setTopics((prev) => prev.map((topic, i) => (i === index ? { ...topic, [field]: value } : topic)));
  };

  async function saveTopics() {
    const validTopics = topics
      .map((topic) => ({
        ...topic,
        topicLabel: topic.topicLabel.trim(),
        tavilyQuery: topic.tavilyQuery.trim(),
        sourceUrls: topic.sourceUrls.map((url) => url.trim()).filter(Boolean),
      }))
      .filter((topic) => topic.topicLabel && topic.tavilyQuery);

    const existingTopicIds = topics.map((topic) => topic.id).filter(Boolean) as string[];

    const deleteRequests = existingTopicIds.map((id) =>
      fetch(`/api/topics?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    );
    const createRequests = validTopics.map((topic) =>
      fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicLabel: topic.topicLabel,
          tavilyQuery: topic.tavilyQuery,
          sourceUrls: topic.sourceUrls,
        }),
      }),
    );

    const responses = await Promise.all([...deleteRequests, ...createRequests]);
    const allSucceeded = responses.every((response) => response.ok);

    if (allSucceeded) {
      showToast("Topics saved");
      const refreshed = await fetch("/api/topics").then((r) => r.json());
      const latestTopics = (refreshed.topics ?? []) as TopicRow[];
      setTopics(
        latestTopics.length > 0
          ? latestTopics.map((topic) => ({
              id: topic.id,
              topicLabel: topic.topicLabel ?? "",
              tavilyQuery: topic.tavilyQuery ?? "",
              sourceUrls: topic.sourceUrls ?? [],
            }))
          : [{ topicLabel: "", tavilyQuery: "", sourceUrls: [] }],
      );
      return;
    }
    showToast("Failed to save", "error");
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

  const sampleCount = samplePostsText
    .split("---")
    .map((p) => p.trim())
    .filter(Boolean).length;
  const isCalibrated = sampleCount >= 3 && !!sentenceLength && !!hookStyle && !!pov && !!formattingStyle;
  const extractedPatterns =
    sentenceLength && hookStyle && pov && formattingStyle
      ? { sentenceLength, hookStyle, pov, formattingStyle, toneMarkers }
      : null;

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
        <div className="mb-4">
          {isCalibrated ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">✓ Calibrated ({sampleCount} posts)</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">⚠ Add 3+ posts to calibrate</span>
          )}
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
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Search query
                    <span className="ml-1 font-normal text-slate-400">— what to search for on the web</span>
                  </label>
                  <input
                    type="text"
                    value={topic.tavilyQuery}
                    onChange={(e) => updateTopic(i, "tavilyQuery", e.target.value)}
                    placeholder="e.g. agentic AI systems 2025"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
            </div>
          ))}

          {topics.length < 5 ? (
            <button
              onClick={() => setTopics((prev) => [...prev, { topicLabel: "", tavilyQuery: "", sourceUrls: [] }])}
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
    </div>
  );
}
