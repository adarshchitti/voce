"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import DraftCard, { DraftView } from "@/components/DraftCard";
import GenerationStream, {
  type GenerationFailure,
  type GenerationResult,
} from "@/components/GenerationStream";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/Toast";

export default function InboxClient({
  showPaymentBanner,
  demoMode = false,
}: {
  showPaymentBanner: boolean;
  /** Server-side isDemo(), threaded from the RSC page. Enables the streamed generation reveal. */
  demoMode?: boolean;
}) {
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
  const [hasPersonalization, setHasPersonalization] = useState(false);
  // Demo only: an in-flight streamed generation. `key` remounts the stream per run.
  const [streamRun, setStreamRun] = useState<{ key: number; topic?: string } | null>(null);
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
        const voiceData = (await voiceRes.json()) as {
          voiceProfile?: {
            calibrationQuality?: string | null;
            personalContext?: string | null;
            personalContextComponents?: string[] | null;
          } | null;
        };
        const topicsData = (await topicsRes.json()) as { topics?: unknown[] };
        const isUncalibrated = (voiceData.voiceProfile?.calibrationQuality ?? "uncalibrated") === "uncalibrated";
        const hasNoTopics = (topicsData.topics ?? []).length === 0;
        setHasIncompleteSetup(isUncalibrated || hasNoTopics);
        const hasRawCtx = !!voiceData.voiceProfile?.personalContext?.trim();
        const hasComponents = (voiceData.voiceProfile?.personalContextComponents?.length ?? 0) > 0;
        setHasPersonalization(hasRawCtx || hasComponents);
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
      <div className="ink-edge mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-p-coral p-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-ink" />
          <p className="text-[13px] font-medium text-ink">
            Your last payment failed. Update your card to keep your account active.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={portalLoading}
            onClick={() => void openBillingPortal()}
          >
            {portalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Update payment method →"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-ink hover:bg-ink/10"
            onClick={() => setShowPaymentBannerVisible(false)}
            aria-label="Dismiss"
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  function renderSetupBanner() {
    if (!hasIncompleteSetup || !showSetupBanner) return null;
    return (
      <div className="ink-edge mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-p-amber p-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-ink" />
          <p className="text-[13px] font-medium text-ink">
            Your account isn&apos;t fully set up yet - complete setup to start generating drafts.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <a href="/onboarding" className={buttonVariants({ size: "sm" })}>
            Complete setup →
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-ink hover:bg-ink/10"
            onClick={() => setShowSetupBanner(false)}
            aria-label="Dismiss"
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  function handleStreamComplete(result: GenerationResult) {
    const wasQuick = !!streamRun?.topic;
    setStreamRun(null);
    setIsGenerating(false);
    setIsQuickGenerating(false);
    if (wasQuick) {
      setQuickTopic("");
      if (typeof result.remainingToday === "number") setQuickRemaining(result.remainingToday);
    }
    showToast(wasQuick ? "Draft added to inbox" : "New draft added to inbox");
    loadDrafts();
  }

  function handleStreamFailed(failure: GenerationFailure) {
    if (failure.status === 429) setQuickRemaining(0);
  }

  function handleStreamDismiss() {
    setStreamRun(null);
    setIsGenerating(false);
    setIsQuickGenerating(false);
  }

  function renderGenerationStream() {
    if (!streamRun) return null;
    return (
      <GenerationStream
        key={streamRun.key}
        topic={streamRun.topic}
        onComplete={handleStreamComplete}
        onFailed={handleStreamFailed}
        onDismiss={handleStreamDismiss}
      />
    );
  }

  async function handleGenerateDraft() {
    if (demoMode) {
      if (streamRun) return;
      setIsGenerating(true);
      setStreamRun({ key: Date.now() });
      return;
    }
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
    if (demoMode) {
      if (streamRun) return;
      setIsQuickGenerating(true);
      setStreamRun({ key: Date.now(), topic: quickTopic.trim() });
      return;
    }
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
      <div className="ink-edge mb-4 rounded-[10px] bg-surface p-4 shadow-card">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            value={quickTopic}
            onChange={(e) => setQuickTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleQuickGenerate();
            }}
            placeholder="What do you want to post about?"
            disabled={isQuickGenerating || quickRemaining <= 0}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => void handleQuickGenerate()}
            disabled={!quickTopic.trim() || isQuickGenerating || quickRemaining <= 0}
          >
            {isQuickGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isQuickGenerating ? "Generating..." : "Generate"}
          </Button>
        </div>
        <p className={`eyebrow mt-3 ${quickRemaining > 0 ? "text-ink-3" : "text-ink-2"}`}>
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
        {renderGenerationStream()}
        <div
          className={`ink-edge-dashed flex-col items-center justify-center rounded-[10px] bg-paper-sunk px-6 py-16 text-center ${streamRun ? "hidden" : "flex"}`}
        >
          <div className="ink-edge mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-surface">
            <Inbox className="h-6 w-6 text-ink" />
          </div>
          {cronProducedNothing ? (
            <>
              <h3 className="mb-1 text-[16px] font-semibold text-ink">No on-topic research today</h3>
              <p className="max-w-sm text-[13px] text-ink-2">
                Nothing in today&apos;s research closely matched your topics. We&apos;ll keep looking
                tomorrow. To generate a draft on a specific topic right now, use Quick Generate above.
              </p>
            </>
          ) : (
            <>
              <h3 className="mb-1 text-[16px] font-semibold text-ink">No drafts waiting</h3>
              <p className="max-w-xs text-[13px] text-ink-2">
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
      {renderGenerationStream()}
      <div className="space-y-4">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            hasPersonalization={hasPersonalization}
            onRemoved={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
          />
        ))}
      </div>
    </div>
  );
}
