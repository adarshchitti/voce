"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import DraftCard, { DraftView } from "@/components/DraftCard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";

export default function InboxClient({ showPaymentBanner }: { showPaymentBanner: boolean }) {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasIncompleteSetup, setHasIncompleteSetup] = useState(false);
  const [showSetupBanner, setShowSetupBanner] = useState(true);
  const [showPaymentBannerVisible, setShowPaymentBannerVisible] = useState(showPaymentBanner);
  const [portalLoading, setPortalLoading] = useState(false);
  const [quickTopic, setQuickTopic] = useState("");
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [quickRemaining, setQuickRemaining] = useState(3);
  const [lastCronStatus, setLastCronStatus] = useState<string | null>(null);
  const [lastCronAt, setLastCronAt] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadDrafts = () => {
    fetch("/api/drafts?status=pending")
      .then((r) => r.json())
      .then((data) => {
        setDrafts(data.drafts ?? []);
        if (typeof data.quickGenerateRemaining === "number") {
          setQuickRemaining(data.quickGenerateRemaining);
        }
        setLastCronStatus(data.lastCronStatus ?? null);
        setLastCronAt(data.lastCronAt ?? null);
      })
      .catch(() => setDrafts([]));
  };

  useEffect(() => {
    loadDrafts();

    Promise.all([fetch("/api/voice"), fetch("/api/topics")])
      .then(async ([voiceRes, topicsRes]) => {
        if (!voiceRes.ok || !topicsRes.ok) return;
        const voiceData = (await voiceRes.json()) as { voiceProfile?: { calibrationQuality?: string | null } | null };
        const topicsData = (await topicsRes.json()) as { topics?: unknown[] };
        const isUncalibrated = (voiceData.voiceProfile?.calibrationQuality ?? "uncalibrated") === "uncalibrated";
        const hasNoTopics = (topicsData.topics ?? []).length === 0;
        setHasIncompleteSetup(isUncalibrated || hasNoTopics);
      })
      .catch(() => setHasIncompleteSetup(false));
  }, []);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Could not open billing", "error");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      showToast("Could not open billing", "error");
    } finally {
      setPortalLoading(false);
    }
  }

  function renderPaymentFailedBanner() {
    if (!showPaymentBannerVisible) return null;
    return (
      <div className="mb-4 flex items-center justify-between rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#D97706]" />
          <p className="text-[13px] text-[#92400E]">
            Your last payment failed. Update your card to keep your account active.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={portalLoading}
            onClick={() => void openBillingPortal()}
            className="text-[12px] font-medium text-[#D97706] transition-colors hover:text-[#92400E] disabled:opacity-50"
          >
            {portalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Update payment method →"
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowPaymentBannerVisible(false)}
            className="text-[#D97706] hover:text-[#92400E]"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  function renderSetupBanner() {
    if (!hasIncompleteSetup || !showSetupBanner) return null;
    return (
      <div className="mb-4 flex items-center justify-between rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#D97706]" />
          <p className="text-[13px] text-[#92400E]">
            Your account isn&apos;t fully set up yet - complete setup to start generating drafts.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <a href="/onboarding" className="text-[12px] font-medium text-[#D97706] transition-colors hover:text-[#92400E]">
            Complete setup →
          </a>
          <button onClick={() => setShowSetupBanner(false)} className="text-[#D97706] hover:text-[#92400E]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

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

  async function handleQuickGenerate() {
    if (!quickTopic.trim() || isQuickGenerating || quickRemaining <= 0) return;
    setIsQuickGenerating(true);
    try {
      const res = await fetch("/api/drafts/generate-quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: quickTopic.trim() }),
      });
      const data = (await res.json()) as { draftId?: string; remainingToday?: number; error?: string; code?: string };
      if (!res.ok) {
        if (res.status === 429) {
          showToast("You've used all 3 quick generates for today. Resets at midnight.", "error");
        } else if (res.status === 402) {
          showToast("Subscription required to generate drafts.", "error");
        } else if (res.status === 404) {
          showToast(data.error ?? "No articles found. Try a different topic.", "error");
        } else {
          showToast("Could not generate a draft. Try again.", "error");
        }
        return;
      }
      setQuickTopic("");
      if (typeof data.remainingToday === "number") setQuickRemaining(data.remainingToday);
      showToast("Draft added to inbox");
      loadDrafts();
    } catch {
      showToast("Could not generate a draft. Try again.", "error");
    } finally {
      setIsQuickGenerating(false);
    }
  }

  function renderQuickGenerate() {
    return (
      <div className="mb-4 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickTopic}
            onChange={(e) => setQuickTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleQuickGenerate();
            }}
            placeholder="What do you want to post about?"
            disabled={isQuickGenerating || quickRemaining <= 0}
            className="h-8 flex-1 rounded-md border border-[#E5E7EB] px-3 text-[13px] outline-none placeholder:text-[#9CA3AF] focus:border-[#2563EB] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleQuickGenerate()}
            disabled={!quickTopic.trim() || isQuickGenerating || quickRemaining <= 0}
            className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md bg-[#2563EB] px-3 text-[12px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {isQuickGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {isQuickGenerating ? "Generating..." : "Generate"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[#9CA3AF]">
          {quickRemaining > 0
            ? `${quickRemaining} of 3 quick generates remaining today`
            : "Daily limit reached · Resets at midnight UTC"}
        </p>
      </div>
    );
  }

  if (drafts.length === 0) {
    const cronRanRecently =
      lastCronAt !== null && Date.now() - new Date(lastCronAt).getTime() < 24 * 60 * 60 * 1000;
    const cronProducedNothing = cronRanRecently && lastCronStatus === "success_no_drafts";

    return (
      <div>
        <PageHeader title="Inbox" description="No drafts right now" />
        {renderPaymentFailedBanner()}
        {renderSetupBanner()}
        {renderQuickGenerate()}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6]">
            <Inbox className="h-6 w-6 text-[#9CA3AF]" />
          </div>
          {cronProducedNothing ? (
            <>
              <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">No on-topic research today</h3>
              <p className="max-w-sm text-[13px] text-[#6B7280]">
                Nothing in today&apos;s research closely matched your topics. We&apos;ll keep looking
                tomorrow. To generate a draft on a specific topic right now, use Quick Generate above.
              </p>
            </>
          ) : (
            <>
              <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">No drafts waiting</h3>
              <p className="max-w-xs text-[13px] text-[#6B7280]">
                New drafts are generated overnight. Check back tomorrow morning, or generate one now.
              </p>
            </>
          )}
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
      {renderPaymentFailedBanner()}
      {renderSetupBanner()}
      {renderQuickGenerate()}
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
