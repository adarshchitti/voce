"use client";

import { useEffect, useState } from "react";
import type { DraftView } from "@/components/DraftCard";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

export default function ArchivePage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  useEffect(() => {
    fetch("/api/drafts?status=archived").then((r) => r.json()).then((d) => setDrafts(d.drafts ?? []));
  }, []);

  return (
    <div>
      <PageHeader title="Archive" description="Archived drafts" />
      <div className="ink-edge-dashed overflow-hidden rounded-[10px] bg-surface">
        {drafts.map((draft, i) => (
          <article
            key={draft.id}
            className={`px-4 py-3 transition-colors hover:bg-paper-sunk ${i < drafts.length - 1 ? "border-b border-hairline" : ""}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <Badge variant="secondary" className="border-dashed bg-transparent">archived</Badge>
              <span className="eyebrow text-ink-3">{new Date(draft.generatedAt).toLocaleDateString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] text-ink-2">{draft.editedText ?? draft.draftText}</p>
          </article>
        ))}
        {drafts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13.5px] font-medium text-ink">No archived drafts</p>
            <p className="mt-0.5 text-[12px] text-ink-2">Rejected or archived drafts will appear here.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
