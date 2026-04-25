"use client";

import { useEffect, useState } from "react";
import type { DraftView } from "@/components/DraftCard";

export default function ArchivePage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  useEffect(() => {
    fetch("/api/drafts?status=archived").then((r) => r.json()).then((d) => setDrafts(d.drafts ?? []));
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Archived drafts</h1>
      {drafts.map((draft) => (
        <article key={draft.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="whitespace-pre-wrap text-sm">{draft.editedText ?? draft.draftText}</p>
        </article>
      ))}
    </div>
  );
}
