"use client";

import { useEffect, useState } from "react";

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
    await fetch("/api/voice", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawDescription, samplePosts }),
    });
  }

  async function addTopic() {
    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicLabel, tavilyQuery }),
    });
    setTopicLabel("");
    setTavilyQuery("");
  }

  async function saveOverrides() {
    const userBannedWords = userBannedWordsText
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    await fetch("/api/voice/overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userBannedWords,
        userNotes: userNotes.trim() ? userNotes : "",
      }),
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-semibold">LinkedIn Connection</h2>
        <a href="/api/auth/linkedin" className="mt-2 inline-block rounded bg-blue-600 px-3 py-2 text-sm text-white">
          Connect LinkedIn
        </a>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-semibold">Voice Profile</h2>
        <textarea className="mt-2 h-24 w-full rounded border border-gray-300 p-2 text-sm" value={rawDescription} onChange={(e) => setRawDescription(e.target.value)} />
        <textarea className="mt-2 h-40 w-full rounded border border-gray-300 p-2 text-sm" value={samplePostsText} onChange={(e) => setSamplePostsText(e.target.value)} />
        <button onClick={saveVoice} className="mt-2 rounded bg-gray-900 px-3 py-2 text-sm text-white">Save voice</button>

        <div className="mt-4 grid gap-2 rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
          <div>Sentence length: {sentenceLength ?? "not extracted yet"}</div>
          <div>Hook style: {hookStyle ?? "not extracted yet"}</div>
          <div>POV: {pov ?? "not extracted yet"}</div>
          <div>Tone: {toneMarkers.length > 0 ? toneMarkers.join(", ") : "not extracted yet"}</div>
          <div>Formatting: {formattingStyle ?? "not extracted yet"}</div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-gray-800">Words/phrases to never use</label>
          <input
            value={userBannedWordsText}
            onChange={(e) => setUserBannedWordsText(e.target.value)}
            placeholder="synergy, leverage, circle back, game-changer"
            className="mt-2 w-full rounded border border-gray-300 p-2 text-sm"
          />
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-gray-800">Additional voice notes</label>
          <textarea
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="I never use bullet lists. I always write in first person. I avoid exclamation marks."
            className="mt-2 h-24 w-full rounded border border-gray-300 p-2 text-sm"
          />
        </div>
        <button onClick={saveOverrides} className="mt-2 rounded border border-gray-300 px-3 py-2 text-sm">Save voice overrides</button>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-semibold">Topics & Sources</h2>
        <input value={topicLabel} onChange={(e) => setTopicLabel(e.target.value)} placeholder="Topic label" className="mt-2 w-full rounded border border-gray-300 p-2 text-sm" />
        <input value={tavilyQuery} onChange={(e) => setTavilyQuery(e.target.value)} placeholder="Tavily query" className="mt-2 w-full rounded border border-gray-300 p-2 text-sm" />
        <button onClick={addTopic} className="mt-2 rounded border border-gray-300 px-3 py-2 text-sm">Add topic</button>
      </section>
    </div>
  );
}
