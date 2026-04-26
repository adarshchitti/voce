"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

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
  const [samplePostsText, setSamplePostsText] = useState("");
  const [sentenceLength, setSentenceLength] = useState<string | null>(null);
  const [hookStyle, setHookStyle] = useState<string | null>(null);
  const [pov, setPov] = useState<string | null>(null);
  const [toneMarkers, setToneMarkers] = useState<string[]>([]);
  const [formattingStyle, setFormattingStyle] = useState<string | null>(null);
  const [userBannedWordsText, setUserBannedWordsText] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [topicLabel, setTopicLabel] = useState("");
  const [tavilyQuery, setTavilyQuery] = useState("");
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
    });
  }, []);

  async function saveVoice() {
    const samplePosts = samplePostsText
      .split("---")
      .map((p) => p.trim())
      .filter(Boolean);
    const response = await fetch("/api/voice", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawDescription, samplePosts }),
    });
    showToast(response.ok ? "Voice profile saved" : "Failed to save", response.ok ? "success" : "error");
  }

  async function addTopic() {
    const response = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicLabel, tavilyQuery }),
    });
    showToast(response.ok ? "Topics saved" : "Failed to save", response.ok ? "success" : "error");
    setTopicLabel("");
    setTavilyQuery("");
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
        <a
          href="/api/auth/linkedin"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50"
        >
          Connect LinkedIn
        </a>
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
          <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500">
            <div className="col-span-4">Topic name</div>
            <div className="col-span-5">Search query (Tavily)</div>
            <div className="col-span-3">RSS feed URLs</div>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <input
              value={topicLabel}
              onChange={(e) => setTopicLabel(e.target.value)}
              placeholder="Topic label"
              className="col-span-12 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-4"
            />
            <input
              value={tavilyQuery}
              onChange={(e) => setTavilyQuery(e.target.value)}
              placeholder="Tavily query"
              className="col-span-12 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-5"
            />
            <input
              value=""
              readOnly
              placeholder="(Optional in API)"
              className="col-span-12 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 sm:col-span-3"
            />
          </div>
          <button
            onClick={addTopic}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50"
          >
            Add topic
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Scheduling" description="When approved posts are published">
        <p className="text-sm text-slate-600">Scheduling preferences are currently managed automatically by the publish pipeline.</p>
      </SettingsSection>
    </div>
  );
}
