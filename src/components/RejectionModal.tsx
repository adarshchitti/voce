"use client";

import { useState } from "react";
import { useToast } from "./Toast";

const groupedReasons = [
  {
    title: "About the writing",
    options: [
      { code: "too_formal", label: "Too formal" },
      { code: "too_casual", label: "Too casual" },
      { code: "too_listy", label: "Too listy / structured" },
      { code: "too_long", label: "Too long" },
      { code: "too_short", label: "Too short" },
      { code: "sounds_like_ai", label: "Sounds like AI" },
      { code: "wrong_execution", label: "Good idea, wrong execution" },
      { code: "wrong_tone", label: "Wrong tone" },
    ],
  },
  {
    title: "About the topic/content",
    options: [
      { code: "wrong_topic", label: "Wrong topic" },
      { code: "not_interesting", label: "Not interesting" },
      { code: "factually_off", label: "Factually off" },
    ],
  },
  {
    title: "Other",
    options: [{ code: "other", label: "Other" }],
  },
];

export default function RejectionModal({
  draftId,
  onClose,
  onRejected,
}: {
  draftId: string;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [freeText, setFreeText] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function submit() {
    if (!reasonCode) return;
    setLoading(true);
    const response = await fetch(`/api/drafts/${draftId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode, freeText: reasonCode === "other" ? freeText : undefined }),
    });
    setLoading(false);
    if (!response.ok) {
      showToast("Failed to save", "error");
      return;
    }
    showToast("Draft rejected", "success");
    onRejected();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-semibold text-slate-900">Why reject this draft?</h3>
          <p className="mt-0.5 text-sm text-slate-500">Your feedback improves future drafts</p>
        </div>

        <div className="space-y-2 p-5">
          {groupedReasons.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</p>
              {group.options.map((option) => (
                <label key={option.code} className="group flex cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="reason"
                    value={option.code}
                    checked={reasonCode === option.code}
                    onChange={() => setReasonCode(option.code)}
                    className="accent-blue-600"
                    disabled={loading}
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">{option.label}</span>
                </label>
              ))}
            </div>
          ))}

          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Add detail (optional)"
            rows={2}
            className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!reasonCode || loading}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving..." : "Reject draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
