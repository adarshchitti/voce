"use client";

import { useMemo, useState } from "react";
import RejectionModal from "./RejectionModal";
import VoiceScoreBadge from "./VoiceScoreBadge";

export type DraftView = {
  id: string;
  draftText: string;
  hook: string;
  format: string;
  voiceScore: number | null;
  sourceUrls: string[];
  status: string;
  staleAfter: string;
  generatedAt: string;
  aiTellFlags?: string | null;
  researchItem: {
    title: string;
    url: string;
    summary: string;
    sourceType: string;
    publishedAt: string | null;
  } | null;
  editedText?: string | null;
};

export default function DraftCard({ draft, onRemoved }: { draft: DraftView; onRemoved: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [text, setText] = useState(draft.editedText ?? draft.draftText);
  const [showReject, setShowReject] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");

  const age = useMemo(() => {
    const hours = Math.floor((Date.now() - new Date(draft.generatedAt).getTime()) / 1000 / 60 / 60);
    return `${hours} hours ago`;
  }, [draft.generatedAt]);

  async function approve() {
    const response = await fetch(`/api/drafts/${draft.id}/approve`, { method: "POST" });
    if (response.ok) onRemoved();
  }

  async function saveEdit() {
    await fetch(`/api/drafts/${draft.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedText: text }),
    });
  }

  async function regenerate() {
    const response = await fetch(`/api/drafts/${draft.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: regenInstruction }),
    });
    if (response.ok) onRemoved();
  }

  const stale = new Date(draft.staleAfter).getTime() < Date.now();
  const counterColor = text.length > 2800 ? "text-red-600" : "text-gray-500";
  const aiFlags = (() => {
    if (!draft.aiTellFlags) return null;
    try {
      return JSON.parse(draft.aiTellFlags) as { words: string[]; structure: string[] };
    } catch {
      return null;
    }
  })();

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-xs ${stale ? "text-red-600" : "text-amber-600"}`}>Generated {age}</span>
        <VoiceScoreBadge score={draft.voiceScore} />
      </div>
      {draft.researchItem ? (
        <a href={draft.researchItem.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 underline">
          {draft.researchItem.title}
        </a>
      ) : null}
      {aiFlags && (aiFlags.words.length > 0 || aiFlags.structure.length > 0) && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="font-medium">AI tell detected — review before approving</span>
          {aiFlags.words.length > 0 && (
            <div className="mt-1">
              Words: {aiFlags.words.join(", ")}
            </div>
          )}
          {aiFlags.structure.length > 0 && (
            <div className="mt-1">
              Structure: {aiFlags.structure.join("; ")}
            </div>
          )}
        </div>
      )}

      {editMode ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveEdit}
            className="mt-3 h-48 w-full rounded-md border border-gray-300 p-2 text-sm"
          />
          <div className={`mt-1 text-right text-xs ${counterColor}`}>{text.length}/3000</div>
        </>
      ) : (
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">{text}</pre>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={approve} className="rounded bg-green-600 px-3 py-2 text-sm text-white">
          Approve
        </button>
        <button onClick={() => setEditMode((v) => !v)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          Edit
        </button>
        <button onClick={() => setShowReject(true)} className="rounded bg-red-600 px-3 py-2 text-sm text-white">
          Reject
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={regenInstruction}
          onChange={(e) => setRegenInstruction(e.target.value)}
          placeholder="Regeneration instruction, e.g. make it shorter"
          className="flex-1 rounded border border-gray-300 px-2 py-2 text-sm"
        />
        <button onClick={regenerate} className="rounded border border-gray-300 px-3 py-2 text-sm">
          Regenerate
        </button>
      </div>
      {showReject ? <RejectionModal draftId={draft.id} onClose={() => setShowReject(false)} onRejected={onRemoved} /> : null}
    </article>
  );
}
