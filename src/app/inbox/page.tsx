"use client";

import { useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import DraftCard, { DraftView } from "@/components/DraftCard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";

export default function InboxPage() {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  const loadDrafts = () => {
    fetch("/api/drafts?status=pending")
      .then((r) => r.json())
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => setDrafts([]));
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  async function handleGenerateDraft() {
    try {
      setIsGenerating(true);
      const res = await fetch("/api/drafts/generate-one", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      showToast("New draft added to inbox");
      loadDrafts();
    } catch {
      showToast("Could not generate a draft right now", "error");
    } finally {
      setIsGenerating(false);
    }
  }

  if (drafts.length === 0) {
    return (
      <div>
        <PageHeader title="Inbox" description="No drafts right now" />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6]">
            <Inbox className="h-6 w-6 text-[#9CA3AF]" />
          </div>
          <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">No drafts waiting</h3>
          <p className="max-w-xs text-[13px] text-[#6B7280]">
            New drafts are generated overnight. Check back tomorrow morning, or generate one now.
          </p>
          <Button className="mt-4" onClick={handleGenerateDraft} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Generate a draft now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Inbox"
        description={
          drafts.length > 0
            ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"} waiting for review`
            : "No drafts right now"
        }
      />
      <div className="space-y-4">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            onRemoved={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
          />
        ))}
      </div>
    </div>
  );
}
