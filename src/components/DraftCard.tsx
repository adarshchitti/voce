"use client";

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  Loader2,
  Mic,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import RejectionModal from "./RejectionModal";
import { useToast } from "./Toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateScheduledAt } from "@/lib/scheduler";
import { cn } from "@/lib/utils";
import { combineDateAndTime } from "@/lib/utils";
import { LinkedInPreview } from "./LinkedInPreview";

export type DraftView = {
  id: string;
  draftText: string;
  hook: string;
  format: string;
  hashtags?: string[];
  voiceScore: number | null;
  sourceUrls: string[];
  status: string;
  regenerationCount: number;
  staleAfter: string;
  generatedAt: string;
  aiTellFlags?: string | null;
  researchItem: {
    title: string;
    url: string;
    summary: string;
    sourceType: string;
    publishedAt: string | null;
  } | null;
  editedText?: string | null;
  seriesId?: string | null;
  seriesPosition?: number | null;
  seriesContext?: string | null;
  seriesTitle?: string | null;
  topicLabel?: string | null;
};

function isNearStale(staleAfter: string | Date): boolean {
  const diff = new Date(staleAfter).getTime() - Date.now();
  return diff > 0 && diff < 12 * 60 * 60 * 1000;
}

function parseAiTellFlags(raw: string | null): {
  words: string[];
  phrases: string[];
  structureIssues: string[];
  structural: Record<string, unknown> | null;
  markdownStripped: boolean;
  voice?: string[];
} {
  if (!raw) return { words: [], phrases: [], structureIssues: [], structural: null, markdownStripped: false };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      words: (parsed.words as string[]) ?? [],
      phrases: (parsed.phrases as string[]) ?? [],
      structureIssues: ((parsed.structureIssues ?? parsed.structure) as string[]) ?? [],
      structural: (parsed.structural as Record<string, unknown>) ?? null,
      markdownStripped: (parsed.markdownStripped as boolean) ?? false,
      voice: Array.isArray(parsed.voice) ? (parsed.voice as string[]) : undefined,
    };
  } catch {
    return { words: [], phrases: [], structureIssues: [], structural: null, markdownStripped: false };
  }
}

export default function DraftCard({ draft, onRemoved }: { draft: DraftView; onRemoved: () => void }) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(currentDraft.editedText ?? currentDraft.draftText);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customDate, setCustomDate] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [customTime, setCustomTime] = useState("09:00");
  const [schedulingTimezone, setSchedulingTimezone] = useState("UTC");
  const [nextPreferredLabel, setNextPreferredLabel] = useState("Calculating...");
  const { showToast } = useToast();

  const age = useMemo(() => {
    return formatDistanceToNow(new Date(draft.generatedAt), { addSuffix: true });
  }, [draft.generatedAt]);

  useEffect(() => {
    let active = true;
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const settings = data.settings ?? {};
        const timezone = settings.timezone ?? "UTC";
        setSchedulingTimezone(timezone);
        const computed = calculateScheduledAt({
          preferredTime: settings.preferredTime ?? "09:00",
          timezone,
          jitterMinutes: settings.jitterMinutes ?? 15,
          preferredDays: settings.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"],
        });
        setNextPreferredLabel(format(computed, "EEE, MMM d 'at' h:mm a"));
      })
      .catch(() => {
        if (!active) return;
        setSchedulingTimezone("UTC");
        setNextPreferredLabel("Next available preferred slot");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleApprove(scheduledAt?: string) {
    setIsApproving(true);
    const response = await fetch(`/api/drafts/${currentDraft.id}/approve`, {
      method: "POST",
      headers: scheduledAt ? { "Content-Type": "application/json" } : undefined,
      body: scheduledAt ? JSON.stringify({ scheduledAt }) : undefined,
    });
    setIsApproving(false);
    if (response.ok) {
      showToast("Draft scheduled", "success");
      setShowScheduler(false);
      onRemoved();
      return;
    }
    showToast("Failed to save", "error");
  }

  async function handleConfirmSchedule() {
    if (!useCustomTime) {
      await handleApprove();
      return;
    }
    const scheduledAt = combineDateAndTime(customDate, customTime, schedulingTimezone);
    await handleApprove(scheduledAt);
  }

  async function handleSaveEdits() {
    const response = await fetch(`/api/drafts/${currentDraft.id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedText }),
    });
    if (response.ok) {
      setIsEditing(false);
      showToast("Saved", "success");
    } else {
      showToast("Failed to save", "error");
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    showToast("Regenerating...", "success");
    const response = await fetch(`/api/drafts/${currentDraft.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: regenInstruction }),
    });
    setIsRegenerating(false);
    if (response.ok) {
      showToast("Done", "success");
      onRemoved();
      return;
    }
    showToast("Failed to save", "error");
  }

  async function handlePersonalize() {
    setIsPersonalizing(true);
    try {
      const response = await fetch(`/api/drafts/${currentDraft.id}/personalize`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to personalize");
      }
      const updated = (await response.json()) as Partial<DraftView>;
      setCurrentDraft((prev) => ({ ...prev, ...updated }));
      setEditedText((updated.editedText ?? updated.draftText ?? editedText) as string);
      showToast("Personal angle added");
    } catch {
      showToast("Failed to personalize", "error");
    } finally {
      setIsPersonalizing(false);
    }
  }

  const charCount = editedText.length;
  const aiParsed = parseAiTellFlags(currentDraft.aiTellFlags ?? null);
  const lacksSpecificity = aiParsed.structural?.lacksConcreteness === true;
  const hasFlags =
    aiParsed.words.length > 0 ||
    aiParsed.phrases.length > 0 ||
    aiParsed.structureIssues.length > 0 ||
    (aiParsed.voice?.length ?? 0) > 0 ||
    lacksSpecificity;
  const previewText = editedText || currentDraft.draftText;
  const isNearExpiry = isNearStale(draft.staleAfter);

  return (
    <article className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.07),0_1px_2px_-1px_rgb(0_0_0/0.07)] transition-shadow hover:shadow-[0_4px_6px_-1px_rgb(0_0_0/0.07)]">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#FAFAFA] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {currentDraft.seriesId ? (
            <a
              href={`/projects/${currentDraft.seriesId}`}
              className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6]"
              onClick={(e) => e.stopPropagation()}
            >
              <FolderKanban className="h-2.5 w-2.5" />
              {currentDraft.seriesTitle
                ? `${currentDraft.seriesTitle.slice(0, 20)}${currentDraft.seriesTitle.length > 20 ? "…" : ""}`
                : "Project"}
              {currentDraft.seriesPosition ? ` · #${currentDraft.seriesPosition}` : ""}
            </a>
          ) : null}

          {currentDraft.topicLabel ? (
            <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[11px] text-[#6B7280]">
              {currentDraft.topicLabel}
            </span>
          ) : null}

          {currentDraft.voiceScore != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                currentDraft.voiceScore >= 8 && "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]",
                currentDraft.voiceScore >= 5 &&
                  currentDraft.voiceScore < 8 &&
                  "border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]",
                currentDraft.voiceScore < 5 && "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
              )}
            >
              <Mic className="h-2.5 w-2.5" />
              Voice {currentDraft.voiceScore}/10
            </span>
          ) : null}

          {hasFlags ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-medium text-[#D97706]">
              <AlertTriangle className="h-2.5 w-2.5" />
              AI tells detected
            </span>
          ) : null}
          {lacksSpecificity ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-medium text-[#B45309]">
              Low specificity
            </span>
          ) : null}

          <span className="text-[11px] text-[#9CA3AF]">{age}</span>
          {currentDraft.regenerationCount > 0 ? (
            <span className="text-[11px] text-[#9CA3AF]">Regenerated {currentDraft.regenerationCount}×</span>
          ) : null}
          {isNearExpiry ? <span className="text-[11px] font-medium text-[#D97706]">· Expires soon</span> : null}
        </div>

        <button className="flex h-7 w-7 items-center justify-center rounded-md text-[#9CA3AF] transition-colors hover:bg-[#F3F4F6] hover:text-[#374151]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 divide-[#E5E7EB] md:grid-cols-2 md:divide-x">
        <div className="flex flex-col gap-3 p-4">
          {currentDraft.seriesContext ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-[12px] text-[#6B7280] transition-colors hover:text-[#111827]">
                <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-90" />
                Continuing from post #{Math.max(1, (currentDraft.seriesPosition ?? 1) - 1)}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 border-l-2 border-[#E5E7EB] py-1 pl-3 text-[12px] italic text-[#6B7280]">
                {currentDraft.seriesContext}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <textarea
            className="min-h-[180px] w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-[#111827] outline-none placeholder:text-[#9CA3AF]"
            value={editedText}
            onChange={(e) => {
              setIsEditing(true);
              setEditedText(e.target.value);
            }}
            placeholder="Draft text will appear here..."
          />

          {draft.sourceUrls?.[0] ? (
            <a
              href={draft.sourceUrls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-[12px] text-[#6B7280] transition-colors hover:text-[#2563EB]"
            >
              <ExternalLink className="h-3 w-3 group-hover:text-[#2563EB]" />
              {draft.sourceUrls[0].includes("tavily")
                ? "Source article"
                : (() => {
                    try {
                      return new URL(draft.sourceUrls[0]).hostname.replace("www.", "");
                    } catch {
                      return "Source article";
                    }
                  })()}
            </a>
          ) : null}

          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
                placeholder="Regeneration instruction (optional)..."
                maxLength={300}
                className="h-8 flex-1 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-[12px] text-[#374151] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                onKeyDown={(e) => e.key === "Enter" && regenInstruction && !isRegenerating && handleRegenerate()}
              />
              <button
                onClick={handleRegenerate}
                disabled={!regenInstruction || isRegenerating}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#374151] transition-colors hover:bg-[#F3F4F6] disabled:opacity-50"
              >
                {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Regenerate
              </button>
            </div>
            <p className="text-right text-[11px] tabular-nums text-[#9CA3AF]">{regenInstruction.length} / 300</p>
          </div>

          <button
            onClick={handlePersonalize}
            disabled={isPersonalizing}
            className="inline-flex items-center gap-1.5 self-start text-[12px] text-[#6B7280] transition-colors hover:text-[#2563EB] disabled:opacity-50"
          >
            {isPersonalizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isPersonalizing ? "Adding personal angle..." : "Add personal angle"}
          </button>
        </div>

        <div className="border-t border-[#E5E7EB] bg-[#F7F7F7] p-4 md:border-t-0">
          <button
            className="mb-3 flex w-full items-center justify-between rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#374151] md:hidden"
            onClick={() => setShowPreviewMobile((prev) => !prev)}
          >
            Show LinkedIn preview
            <ChevronDown className={cn("h-4 w-4 transition-transform", showPreviewMobile && "rotate-180")} />
          </button>

          <div className={cn("hidden md:block", showPreviewMobile && "block")}>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[#9CA3AF]">LinkedIn Preview</p>
            <LinkedInPreview text={previewText} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[#E5E7EB] bg-[#FAFAFA] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                charCount / 3000 < 0.8 && "bg-[#16A34A]",
                charCount / 3000 >= 0.8 && charCount / 3000 < 1 && "bg-[#D97706]",
                charCount / 3000 >= 1 && "bg-[#DC2626]"
              )}
              style={{ width: `${Math.min((charCount / 3000) * 100, 100)}%` }}
            />
          </div>
          <span className={cn("text-[11px] font-medium tabular-nums", charCount > 3000 ? "text-[#DC2626]" : "text-[#9CA3AF]")}>
            {charCount}/3000
          </span>
        </div>

        {currentDraft.hashtags && currentDraft.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {currentDraft.hashtags.map((tag) => (
              <span key={tag} className="rounded bg-[#EFF6FF] px-1.5 py-0.5 text-[11px] text-[#2563EB]">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        ) : null}

        {hasFlags ? (
          <div className="space-y-2 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-2 text-[11px] text-[#92400E]">
            {aiParsed.words.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-[#D97706]">Flagged words</p>
                <div className="flex flex-wrap gap-1">
                  {aiParsed.words.map((w) => (
                    <span key={w} className="rounded-md border border-[#FDE68A] bg-white/80 px-1.5 py-0.5 text-[10px] text-[#B45309]">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {aiParsed.phrases.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-[#D97706]">Flagged phrases</p>
                <ul className="list-inside list-disc space-y-0.5 text-[#B45309]">
                  {aiParsed.phrases.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {aiParsed.structureIssues.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-[#D97706]">Structure</p>
                <ul className="list-inside list-disc space-y-0.5 text-[#B45309]">
                  {aiParsed.structureIssues.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(aiParsed.voice?.length ?? 0) > 0 ? (
              <div>
                <p className="mb-1 font-medium text-[#D97706]">Voice calibration</p>
                <ul className="list-inside list-disc space-y-0.5 text-[#B45309]">
                  {(aiParsed.voice ?? []).map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {aiParsed.markdownStripped ? (
          <p className="text-[10px] text-[#9CA3AF]">Markdown formatting was removed from this draft for scanning.</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            onClick={() => setShowRejectModal(true)}
            className="h-8 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#6B7280] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
          >
            Reject
          </button>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                onClick={handleSaveEdits}
                className="h-8 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#374151] transition-colors hover:bg-[#F3F4F6]"
              >
                Save edits
              </button>
            ) : null}
            <Popover open={showScheduler} onOpenChange={setShowScheduler}>
              <PopoverTrigger asChild>
                <button
                  disabled={isApproving || charCount > 3000}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      Approve & Schedule
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] space-y-3 p-4">
                <p className="text-[13px] font-medium text-[#111827]">Schedule this post</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[#E5E7EB] p-2.5 text-[12px]">
                    <input
                      type="radio"
                      checked={!useCustomTime}
                      onChange={() => setUseCustomTime(false)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-[#111827]">Next preferred slot</p>
                      <p className="text-[#6B7280]">{nextPreferredLabel}</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[#E5E7EB] p-2.5 text-[12px]">
                    <input
                      type="radio"
                      checked={useCustomTime}
                      onChange={() => setUseCustomTime(true)}
                      className="mt-0.5"
                    />
                    <div className="w-full space-y-2">
                      <p className="font-medium text-[#111827]">Pick a date and time</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={customDate}
                          onChange={(e) => setCustomDate(e.target.value)}
                          disabled={!useCustomTime}
                          className="h-8 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] disabled:opacity-60"
                        />
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          disabled={!useCustomTime}
                          className="h-8 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] disabled:opacity-60"
                        />
                      </div>
                      <select
                        value={schedulingTimezone}
                        onChange={(e) => setSchedulingTimezone(e.target.value)}
                        disabled={!useCustomTime}
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] disabled:opacity-60"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="Asia/Kolkata">Asia/Kolkata</option>
                      </select>
                    </div>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduler(false)}
                    className="h-8 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSchedule}
                    disabled={isApproving}
                    className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Confirm & Schedule
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {showRejectModal ? <RejectionModal draftId={currentDraft.id} onClose={() => setShowRejectModal(false)} onRejected={onRemoved} /> : null}
    </article>
  );
}
