"use client";

import { useEffect, useState } from "react";
import DraftCard, { DraftView } from "@/components/DraftCard";

export default function InboxPage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]);

  useEffect(() => {
    fetch("/api/drafts?status=pending")
      .then((r) => r.json())
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => setDrafts([]));
  }, []);

  if (drafts.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
              <p className="mt-0.5 text-sm text-slate-500">Review and approve your daily drafts</p>
            </div>
          </div>
        </div>
        <div className="py-20 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <span className="text-2xl">📬</span>
          </div>
          <h3 className="mb-1 font-medium text-slate-900">No drafts yet</h3>
          <p className="mx-auto max-w-sm text-sm text-slate-500">
            Your inbox fills overnight. New drafts will appear here each morning based on your topics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Inbox
              <span className="ml-2 text-sm font-normal text-slate-400">{drafts.length} pending</span>
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">Review and approve your daily drafts</p>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {drafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} onRemoved={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))} />
        ))}
      </div>
    </div>
  );
}
