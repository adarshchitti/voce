"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [rawDescription, setRawDescription] = useState("");
  const [samplePostsText, setSamplePostsText] = useState("");
  const [topicLabel, setTopicLabel] = useState("");
  const [tavilyQuery, setTavilyQuery] = useState("");

  useEffect(() => {
    fetch("/api/voice").then((r) => r.json()).then((d) => {
      setRawDescription(d.voiceProfile?.rawDescription ?? "");
      setSamplePostsText((d.voiceProfile?.samplePosts ?? []).join("\n---\n"));
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
