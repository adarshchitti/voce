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
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        No pending drafts right now. Drafts are generated overnight and will show up here tomorrow.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} onRemoved={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))} />
      ))}
    </div>
  );
}
