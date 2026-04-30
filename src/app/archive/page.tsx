"use client";

import { useEffect, useState } from "react";
import type { DraftView } from "@/components/DraftCard";
import { PageHeader } from "@/components/ui/page-header";

export default function ArchivePage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  useEffect(() => {
    fetch("/api/drafts?status=archived").then((r) => r.json()).then((d) => setDrafts(d.drafts ?? []));
  }, []);

  return (
    <div>
      <PageHeader title="Archive" description="Archived drafts" />
      <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
        {drafts.map((draft, i) => (
          <article
            key={draft.id}
            className={`px-4 py-3 transition-colors hover:bg-[#FAFAFA] ${i < drafts.length - 1 ? "border-b border-[#F3F4F6]" : ""}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] text-[#6B7280]">archived</span>
              <span className="text-[11px] text-[#9CA3AF]">{new Date(draft.generatedAt).toLocaleDateString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] text-[#374151]">{draft.editedText ?? draft.draftText}</p>
          </article>
        ))}
        {drafts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13.5px] font-medium text-[#374151]">No archived drafts</p>
            <p className="mt-0.5 text-[12px] text-[#9CA3AF]">Rejected or archived drafts will appear here.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
