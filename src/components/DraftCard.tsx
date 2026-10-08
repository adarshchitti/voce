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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateScheduledAt } from "@/lib/scheduler";
import { cn } from "@/lib/utils";
import { combineDateAndTime } from "@/lib/utils";
import { LinkedInPreview } from "./LinkedInPreview";
import { QualityFlags, parseAiTellFlags } from "./QualityFlags";

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

type PersonalizationMetadata = {
  mode: "targeted" | "no_fit" | "legacy_raw_context";
  componentUsed: string | null;
  rationale: string | null;
};

// Renders the small notice under the "Add personal angle" button after a
// successful personalization. Three states (per spec):
//   - targeted: a specific component was woven in
//   - no_fit: components exist but none matched the topic
//   - legacy_raw_context: components empty, raw text used (extraction may
//                         not have produced specifics yet)
function PersonalizationNotice({ meta }: { meta: PersonalizationMetadata }) {
  if (meta.mode === "targeted" && meta.componentUsed) {
    const truncated =
      meta.componentUsed.length > 80
        ? `${meta.componentUsed.slice(0, 80)}…`
        : meta.componentUsed;
    return (
      <p className="text-[12px] text-ink-3">
        Personalized using: <span className="text-ink-2">{truncated}</span>
      </p>
    );
  }
  if (meta.mode === "no_fit") {
    return (
      <p className="text-[12px] text-ink-3">
        No personal experience fit this topic. Personalized for tone.
      </p>
    );
  }
  return (
    <p className="text-[12px] text-ink-3">
      Personalized for tone. Add more specific experiences in{" "}
      <a href="/settings" className="link-rule text-ink">
        settings
      </a>{" "}
      to enable targeted personalization.
    </p>
  );
}

export default function DraftCard({
  draft,
  onRemoved,
  hasPersonalization = true,
}: {
  draft: DraftView;
  onRemoved: () => void;
  hasPersonalization?: boolean;
}) {
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
  const [personalizationNotice, setPersonalizationNotice] =
    useState<PersonalizationMetadata | null>(null);
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
        const errBody = (await response.json().catch(() => ({}))) as {
          code?: string;
          error?: string;
        };
        if (errBody.code === "NO_PERSONAL_CONTEXT") {
          showToast("Add personal experiences in settings to use this feature", "error");
          return;
        }
        throw new Error(errBody.error ?? "Failed to personalize");
      }
      const updated = (await response.json()) as Partial<DraftView> & {
        personalization?: PersonalizationMetadata;
      };
      const { personalization, ...draftFields } = updated;
      setCurrentDraft((prev) => ({ ...prev, ...draftFields }));
      setEditedText((draftFields.editedText ?? draftFields.draftText ?? editedText) as string);
      if (personalization) setPersonalizationNotice(personalization);
      showToast("Personal angle added");
    } catch {
      showToast("Failed to personalize", "error");
    } finally {
      setIsPersonalizing(false);
    }
  }

  const charCount = editedText.length;
  const aiParsed = parseAiTellFlags(currentDraft.aiTellFlags ?? null);
  const warningFlags = aiParsed.flags.filter((f) => f.severity === "warning");
  const infoFlags = aiParsed.flags.filter((f) => f.severity === "info");
  const hasWarnings = warningFlags.length > 0 || aiParsed.voice.length > 0;
  const hasAnyFlag = hasWarnings || infoFlags.length > 0;
  const showRegenHint = currentDraft.regenerationCount > 0 && hasAnyFlag;
  const previewText = editedText || currentDraft.draftText;
  const isNearExpiry = isNearStale(draft.staleAfter);

  return (
    <article className="overflow-hidden rounded-[10px] border-2 border-ink bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {currentDraft.seriesId ? (
            <a
              href={`/projects/${currentDraft.seriesId}`}
              className="inline-flex"
              onClick={(e) => e.stopPropagation()}
            >
              <Chip tone="surface" size="sm" interactive>
                <FolderKanban className="size-3" />
                {currentDraft.seriesTitle
                  ? `${currentDraft.seriesTitle.slice(0, 20)}${currentDraft.seriesTitle.length > 20 ? "…" : ""}`
                  : "Project"}
                {currentDraft.seriesPosition ? ` · #${currentDraft.seriesPosition}` : ""}
              </Chip>
            </a>
          ) : null}

          {currentDraft.topicLabel ? (
            <Chip tone="blue" size="sm">
              {currentDraft.topicLabel}
            </Chip>
          ) : null}

          {currentDraft.voiceScore != null ? (
            <Badge
              variant={
                currentDraft.voiceScore >= 8
                  ? "success"
                  : currentDraft.voiceScore >= 5
                    ? "warning"
                    : "flagged"
              }
              className="h-6 gap-1.5 px-2.5"
            >
              <Mic className="size-3" />
              Voice {currentDraft.voiceScore}/10
            </Badge>
          ) : null}

          {hasWarnings ? (
            <Badge variant="warning" className="h-6 gap-1.5 px-2.5">
              <AlertTriangle className="size-3" />
              {warningFlags.length + aiParsed.voice.length} flag{warningFlags.length + aiParsed.voice.length === 1 ? "" : "s"} to review
            </Badge>
          ) : null}

          <span className="text-[12px] text-ink-3">{age}</span>
          {currentDraft.regenerationCount > 0 ? (
            <span className="text-[12px] text-ink-3">Regenerated {currentDraft.regenerationCount}×</span>
          ) : null}
          {isNearExpiry ? (
            <Chip variant="dashed" size="sm">
              Expires soon
            </Chip>
          ) : null}
        </div>

        <Button variant="ghost" size="icon-sm" aria-label="More actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 divide-hairline md:grid-cols-2 md:divide-x">
        <div className="flex flex-col gap-4 p-5">
          {currentDraft.seriesContext ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-[12px] text-ink-2 transition-colors hover:text-ink">
                <ChevronRight className="size-3 transition-transform [[data-state=open]_&]:rotate-90" />
                Continuing from post #{Math.max(1, (currentDraft.seriesPosition ?? 1) - 1)}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 border-l-2 border-hairline py-1 pl-3 text-[12px] italic text-ink-2">
                {currentDraft.seriesContext}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <QualityFlags aiTellFlags={currentDraft.aiTellFlags ?? null} showRescanNote={showRegenHint} />

          <textarea
            className="min-h-[220px] w-full resize-none border-0 bg-transparent text-[15px] leading-[1.65] text-ink outline-none placeholder:text-ink-3"
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
              className="group inline-flex items-center gap-1.5 self-start text-[12px] text-ink-2 transition-colors hover:text-accent-solid"
            >
              <ExternalLink className="size-3" />
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

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <Input
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
                placeholder="Regeneration instruction (optional)..."
                maxLength={300}
                className="h-9 flex-1 text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && regenInstruction && !isRegenerating && handleRegenerate()}
              />
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={!regenInstruction || isRegenerating}
              >
                {isRegenerating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Regenerate
              </Button>
            </div>
            <p className="eyebrow text-right tabular-nums text-ink-3">{regenInstruction.length} / 300</p>
          </div>

          {hasPersonalization ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePersonalize}
              disabled={isPersonalizing}
              className="-ml-3 self-start"
            >
              {isPersonalizing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {isPersonalizing ? "Adding personal angle..." : "Add personal angle"}
            </Button>
          ) : (
            <p className="self-start text-[12px] text-ink-3">
              <a href="/settings" className="link-rule text-ink">
                Add personal experiences
              </a>{" "}
              in settings to enable personalization on drafts.
            </p>
          )}
          {personalizationNotice ? (
            <PersonalizationNotice meta={personalizationNotice} />
          ) : null}
        </div>

        <div className="border-t-2 border-ink bg-paper-sunk p-5 md:border-t-0">
          <Button
            variant="outline"
            size="sm"
            className="mb-3 w-full justify-between md:hidden"
            onClick={() => setShowPreviewMobile((prev) => !prev)}
          >
            Show LinkedIn preview
            <ChevronDown className={cn("size-4 transition-transform", showPreviewMobile && "rotate-180")} />
          </Button>

          <div className={cn("hidden md:block", showPreviewMobile && "block")}>
            <p className="eyebrow mb-3 text-ink-3">LinkedIn Preview</p>
            <LinkedInPreview text={previewText} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-ink bg-paper px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-surface">
            <div
              className={cn(
                "h-full transition-all",
                charCount / 3000 < 0.8 && "bg-p-sage",
                charCount / 3000 >= 0.8 && charCount / 3000 < 1 && "bg-p-amber",
                charCount / 3000 >= 1 && "bg-p-coral"
              )}
              style={{ width: `${Math.min((charCount / 3000) * 100, 100)}%` }}
            />
          </div>
          <span
            className={cn(
              "eyebrow tabular-nums",
              charCount > 3000 ? "rounded-full border-2 border-ink bg-p-coral px-2 text-ink" : "text-ink-3"
            )}
          >
            {charCount}/3000
          </span>
        </div>

        {currentDraft.hashtags && currentDraft.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {currentDraft.hashtags.map((tag) => (
              <Chip key={tag} tone="accent" size="sm">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </Chip>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Button
            variant="outline"
            onClick={() => setShowRejectModal(true)}
            className="hover:bg-p-coral hover:text-ink"
          >
            Reject
          </Button>

          <div className="flex items-center gap-3">
            {isEditing ? (
              <Button variant="secondary" onClick={handleSaveEdits}>
                Save edits
              </Button>
            ) : null}
            <Popover open={showScheduler} onOpenChange={setShowScheduler}>
              <PopoverTrigger asChild>
                <Button disabled={isApproving || charCount > 3000}>
                  {isApproving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      Approve & Schedule
                    </>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] space-y-3 p-4">
                <p className="text-[14px] font-semibold text-ink">Schedule this post</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border-2 border-ink bg-surface p-2.5 text-[12px] transition-colors has-checked:bg-accent-tint">
                    <input
                      type="radio"
                      checked={!useCustomTime}
                      onChange={() => setUseCustomTime(false)}
                      className="mt-0.5 accent-accent-solid"
                    />
                    <div>
                      <p className="font-medium text-ink">Next preferred slot</p>
                      <p className="text-ink-2">{nextPreferredLabel}</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border-2 border-ink bg-surface p-2.5 text-[12px] transition-colors has-checked:bg-accent-tint">
                    <input
                      type="radio"
                      checked={useCustomTime}
                      onChange={() => setUseCustomTime(true)}
                      className="mt-0.5 accent-accent-solid"
                    />
                    <div className="w-full space-y-2">
                      <p className="font-medium text-ink">Pick a date and time</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={customDate}
                          onChange={(e) => setCustomDate(e.target.value)}
                          disabled={!useCustomTime}
                          className="h-8 px-2 text-[12px]"
                        />
                        <Input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          disabled={!useCustomTime}
                          className="h-8 px-2 text-[12px]"
                        />
                      </div>
                      <select
                        value={schedulingTimezone}
                        onChange={(e) => setSchedulingTimezone(e.target.value)}
                        disabled={!useCustomTime}
                        className="h-8 w-full rounded-[10px] border-2 border-ink bg-surface px-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-solid disabled:cursor-not-allowed disabled:opacity-50"
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
                  <Button type="button" variant="outline" onClick={() => setShowScheduler(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleConfirmSchedule} disabled={isApproving}>
                    {isApproving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Confirm & Schedule
                  </Button>
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
