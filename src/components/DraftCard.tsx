"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import RejectionModal from "./RejectionModal";
import { useToast } from "./Toast";

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

function isNearStale(staleAfter: string | Date): boolean {
  const diff = new Date(staleAfter).getTime() - Date.now();
  return diff > 0 && diff < 12 * 60 * 60 * 1000;
}

function LinkedInPreview({ text }: { text: string }) {
  const PREVIEW_CHAR_LIMIT = 210;
  const [expanded, setExpanded] = useState(false);
  const displayText = !expanded && text.length > PREVIEW_CHAR_LIMIT ? text.slice(0, PREVIEW_CHAR_LIMIT) : text;
  const lines = displayText.split("\n");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700">
            <span className="text-sm font-bold text-white">Y</span>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
              Your Name
              <span className="font-normal text-slate-400">• 1st</span>
            </div>
            <div className="text-xs text-slate-500">Your headline · Just now</div>
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {lines.map((line, i) => (
            <span key={i}>
              {line}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
          {!expanded && text.length > PREVIEW_CHAR_LIMIT ? (
            <>
              {"... "}
              <button onClick={() => setExpanded(true)} className="font-medium text-slate-500 hover:text-slate-700">
                see more
              </button>
            </>
          ) : null}
          {expanded && text.length > PREVIEW_CHAR_LIMIT ? (
            <>
              {" "}
              <button onClick={() => setExpanded(false)} className="font-medium text-slate-500 hover:text-slate-700">
                see less
              </button>
            </>
          ) : null}
        </p>
      </div>
      <div className="border-t border-slate-100 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>🔁 Repost</span>
          <span>📤 Send</span>
        </div>
      </div>
    </div>
  );
}

function CharacterBar({ count, limit }: { count: number; limit: number }) {
  const pct = Math.min((count / limit) * 100, 100);
  const color = count > limit ? "bg-red-500" : count > limit * 0.9 ? "bg-amber-500" : "bg-green-500";
  const textColor = count > limit ? "text-red-600" : count > limit * 0.9 ? "text-amber-600" : "text-slate-400";

  return (
    <div className="space-y-1">
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-200 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-right text-xs ${textColor}`}>
        {count} / {limit}
        {count > limit ? <span className="font-medium"> — too long</span> : null}
      </div>
    </div>
  );
}

export default function DraftCard({ draft, onRemoved }: { draft: DraftView; onRemoved: () => void }) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(currentDraft.editedText ?? currentDraft.draftText);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const { showToast } = useToast();

  const age = useMemo(() => {
    return formatDistanceToNow(new Date(draft.generatedAt), { addSuffix: true });
  }, [draft.generatedAt]);

  async function handleApprove() {
    setIsApproving(true);
    const response = await fetch(`/api/drafts/${currentDraft.id}/approve`, { method: "POST" });
    setIsApproving(false);
    if (response.ok) {
      showToast("Draft scheduled", "success");
      onRemoved();
      return;
    }
    showToast("Failed to save", "error");
  }

  async function handleSaveEdits() {
    const response = await fetch(`/api/drafts/${currentDraft.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedText }),
    });
    if (response.ok) {
      setIsEditing(false);
      showToast("Saved", "success");
    } else {
      showToast("Failed to save", "error");
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    showToast("Regenerating...", "success");
    const response = await fetch(`/api/drafts/${currentDraft.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: regenInstruction }),
    });
    setIsRegenerating(false);
    if (response.ok) {
      showToast("Done", "success");
      onRemoved();
      return;
    }
    showToast("Failed to save", "error");
  }

  async function handlePersonalize() {
    setIsPersonalizing(true);
    try {
      const response = await fetch(`/api/drafts/${currentDraft.id}/personalize`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to personalize");
      }
      const updated = (await response.json()) as Partial<DraftView>;
      setCurrentDraft((prev) => ({ ...prev, ...updated }));
      setEditedText((updated.editedText ?? updated.draftText ?? editedText) as string);
      showToast("Personal angle added");
    } catch {
      showToast("Failed to personalize", "error");
    } finally {
      setIsPersonalizing(false);
    }
  }

  const charCount = editedText.length;
  const aiFlags = (() => {
    if (!currentDraft.aiTellFlags) return null;
    try {
      return JSON.parse(currentDraft.aiTellFlags) as { words: string[]; structure: string[] };
    } catch {
      return null;
    }
  })();
  const hasFlags = !!aiFlags && (aiFlags.words.length > 0 || aiFlags.structure.length > 0);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-3">
          {currentDraft.voiceScore != null ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                currentDraft.voiceScore != null && currentDraft.voiceScore >= 8
                  ? "bg-green-100 text-green-700"
                  : currentDraft.voiceScore != null && currentDraft.voiceScore >= 5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              Voice {currentDraft.voiceScore}/10
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Voice learning</span>
          )}
          {currentDraft.researchItem ? (
            <a href={currentDraft.researchItem.url} target="_blank" rel="noopener noreferrer" className="max-w-xs truncate text-xs text-blue-600 hover:text-blue-700 hover:underline">
              {currentDraft.researchItem.title}
            </a>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {isNearStale(draft.staleAfter) ? <span className="text-xs font-medium text-amber-600">Expires soon</span> : null}
          <span className="text-xs text-slate-400">{age}</span>
        </div>
      </div>

      {hasFlags ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-2.5">
          <p className="mb-0.5 text-xs font-medium text-amber-800">AI tell detected — review before approving</p>
          {aiFlags?.words.length ? <p className="text-xs text-amber-700">Words: {aiFlags.words.join(", ")}</p> : null}
          {aiFlags?.structure.length ? <p className="text-xs text-amber-700">Structure: {aiFlags.structure.join("; ")}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-slate-100">
        <div className="space-y-3 p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Draft</span>
            {isEditing ? <span className="text-xs text-blue-600">Editing</span> : null}
          </div>
          {isEditing ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              rows={12}
              className="w-full resize-none select-text rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="-mx-2 min-h-32 cursor-text select-text rounded-lg p-2 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap transition-colors duration-150 hover:bg-slate-50"
            >
              {editedText}
            </div>
          )}

          <CharacterBar count={charCount} limit={3000} />

          <div className="flex gap-2 pt-1">
            <input
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              placeholder="Regenerate with instruction..."
              className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && regenInstruction && !isRegenerating && handleRegenerate()}
            />
            <button
              onClick={handleRegenerate}
              disabled={!regenInstruction || isRegenerating}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Regenerate"
            >
              {isRegenerating ? "..." : "↺"}
            </button>
          </div>

          <div className="border-t border-slate-100 pt-1">
            <button
              onClick={handlePersonalize}
              disabled={isPersonalizing}
              className="flex items-center gap-2 text-sm text-slate-500 transition-colors duration-150 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-base">🎯</span>
              <span>{isPersonalizing ? "Adding personal angle..." : "Add personal angle"}</span>
            </button>
            <p className="ml-6 mt-0.5 text-xs text-slate-400">
              Connects this post to your research or Klaviyo experience where it fits
            </p>
          </div>
        </div>

        <div className="space-y-3 bg-slate-50 p-5 lg:bg-white">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview</span>
          </div>
          <LinkedInPreview text={editedText} />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
        <button
          onClick={() => setShowRejectModal(true)}
          className="order-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors duration-150 hover:border-red-300 hover:bg-red-50 sm:order-1"
        >
          Reject
        </button>
        {isEditing ? (
          <button
            onClick={handleSaveEdits}
            className="order-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            Save edits
          </button>
        ) : null}
        <button
          onClick={handleApprove}
          disabled={isApproving || charCount > 3000}
          className="order-1 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:order-3"
        >
          {isApproving ? "Scheduling..." : "Approve & Schedule"}
        </button>
      </div>

      {showRejectModal ? <RejectionModal draftId={currentDraft.id} onClose={() => setShowRejectModal(false)} onRejected={onRemoved} /> : null}
    </article>
  );
}
