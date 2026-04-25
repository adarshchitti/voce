"use client";

import { useState } from "react";

const reasons = [
  { code: "wrong_topic", label: "Wrong topic" },
  { code: "wrong_tone", label: "Wrong tone" },
  { code: "not_interesting", label: "Not interesting" },
  { code: "factually_off", label: "Factually off" },
  { code: "other", label: "Other" },
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
  const [loading, setLoading] = useState<string | null>(null);

  async function submit(reasonCode: string) {
    setLoading(reasonCode);
    const response = await fetch(`/api/drafts/${draftId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode, freeText: reasonCode === "other" ? freeText : undefined }),
    });
    setLoading(null);
    if (!response.ok) return;
    onRejected();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow">
        <h3 className="mb-3 text-lg font-semibold">Reject draft</h3>
        <div className="space-y-2">
          {reasons.map((reason) => (
            <button
              key={reason.code}
              onClick={() => submit(reason.code)}
              disabled={loading !== null || (reason.code === "other" && freeText.trim().length === 0)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading === reason.code ? "Saving..." : reason.label}
            </button>
          ))}
        </div>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Reason details (required for Other)"
          className="mt-3 h-20 w-full rounded-md border border-gray-300 p-2 text-sm"
        />
        <button onClick={onClose} disabled={loading !== null} className="mt-3 text-sm text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
