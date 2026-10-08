"use client";

import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import type { SubscriptionStatus } from "@/lib/subscription";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { SchedulingForm, type SchedulingSettings } from "@/components/SchedulingForm";
import { addBannedWord, removeBannedWord } from "@/lib/banned-words-helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Chip, chipVariants } from "@/components/ui/chip";
import { isBillingEnabled } from "@/lib/billing";

interface LinkedInTokenView {
  status: "active" | "expired" | string;
  personUrn: string;
  tokenExpiry: string;
}

interface TopicRow {
  id?: string;
  topicLabel: string;
  tavilyQuery: string;
  sourceUrls: string[];
  priorityWeight: number;
  lastSavedTopicLabel?: string;
  querySuggested?: boolean;
}

type SuggestedSourceCandidate = { url: string; name: string; why: string };

type SourceSuggestionState =
  | { kind: "loading" }
  | {
      kind: "results";
      candidates: SuggestedSourceCandidate[];
      selected: Record<string, boolean>;
      stats?: { requested: number; validated: number };
    }
  | { kind: "error"; message: string };

const AUTO_SUGGEST_SOURCES_ENABLED = process.env.NEXT_PUBLIC_AUTO_SUGGEST_SOURCES === "true";

function normaliseSourceUrlForCompare(u: string): string {
  return u.trim().toLowerCase().replace(/\/+$/, "");
}

function parseLoadedSamplePosts(samplePosts: string[] | undefined): string[] {
  if (!samplePosts?.length) return [""];
  const pieces: string[] = [];
  for (const block of samplePosts) {
    const split = block.split(/\n?---\n?/).map((s) => s.trim()).filter(Boolean);
    if (split.length > 1) pieces.push(...split);
    else if (block.trim()) pieces.push(block.trim());
  }
  return pieces.length ? pieces : [""];
}

function formatWritingStyle(profile: {
  avgSentenceLengthWords?: number | null;
  avgWordsPerPost?: number | null;
  paragraphStyle?: string | null;
}): string {
  const parts: string[] = [];
  if (profile.avgSentenceLengthWords != null) {
    parts.push(`${profile.avgSentenceLengthWords}-word sentences on average`);
  }
  if (profile.avgWordsPerPost != null) {
    parts.push(`~${profile.avgWordsPerPost} words per post`);
  }
  if (profile.paragraphStyle) {
    const styleMap: Record<string, string> = {
      single_line: "one sentence per line",
      two_three_lines: "short paragraphs",
      multi_paragraph: "longer paragraphs",
      mixed: "mixed paragraph lengths",
    };
    parts.push(styleMap[profile.paragraphStyle] ?? profile.paragraphStyle);
  }
  return parts.join(" · ") || "Not yet analysed";
}

function formatHookStyle(hookStyle: string | null): string {
  if (!hookStyle) return "Not detected";
  const map: Record<string, string> = {
    question: "Opens with a question",
    bold_claim: "Opens with a bold claim",
    personal_story: "Opens with a personal story",
    data_point: "Opens with a data point or stat",
    contrarian: "Opens with a contrarian take",
  };
  return map[hookStyle] ?? hookStyle;
}

const HOOK_STYLE_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "question", label: "Opens with a question" },
  { value: "bold_claim", label: "Opens with a bold claim" },
  { value: "personal_story", label: "Opens with a personal story" },
  { value: "data_point", label: "Opens with a data point or stat" },
  { value: "contrarian", label: "Opens with a contrarian take" },
];

function HookStyleVoiceRow({
  hookStyle,
  onSave,
}: {
  hookStyle: string | null;
  onSave: (value: string) => void | Promise<void>;
}) {
  const presetSet = new Set(HOOK_STYLE_PRESET_OPTIONS.map((o) => o.value));
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState<string>("__custom__");
  const [customText, setCustomText] = useState("");

  const startEdit = () => {
    if (hookStyle && presetSet.has(hookStyle)) {
      setPreset(hookStyle);
      setCustomText("");
    } else {
      setPreset("__custom__");
      setCustomText(hookStyle ?? "");
    }
    setEditing(true);
  };

  return (
    <div className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-paper-sunk">
      <span className="w-36 flex-shrink-0 pt-0.5 text-[12px] font-medium text-ink-2">How you open posts</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="h-8 w-full rounded-[10px] border-2 border-ink bg-surface px-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-solid"
            >
              {HOOK_STYLE_PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="__custom__">Custom (free text)</option>
            </select>
            {preset === "__custom__" ? (
              <Input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Describe how you usually open posts"
                className="h-8 px-2 text-[13px]"
                autoFocus
              />
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={async () => {
                  const v = preset === "__custom__" ? customText.trim() : preset;
                  await onSave(v);
                  setEditing(false);
                }}
                className="font-medium text-accent-solid"
              >
                Save
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "text-[13px] leading-relaxed",
                hookStyle ? "text-ink" : "text-ink-3",
              )}
            >
              {formatHookStyle(hookStyle)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={startEdit}
              className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              Edit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatEmojiStyle(emojiFrequency: string | null | undefined): string {
  const map: Record<string, string> = {
    none: "No emojis",
    rare: "Rarely uses emojis",
    occasional: "Occasionally uses emojis",
    frequent: "Frequently uses emojis",
  };
  return map[emojiFrequency ?? "none"] ?? "Not detected";
}

function ExportButton() {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const response = await fetch("/api/account/export", { method: "POST" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voce-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Export downloaded");
    } catch {
      showToast("Export failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={loading} className="shrink-0">
      <span className="flex items-center gap-1.5">
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            Export data
          </>
        )}
      </span>
    </Button>
  );
}

export type SettingsSubscriptionSnapshot = {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

function BillingCard({ subscription }: { subscription: SettingsSubscriptionSnapshot }) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const { showToast } = useToast();
  const { status, trialEndsAt } = subscription;

  const trialDays =
    status === "trialing" && trialEndsAt
      ? Math.max(0, differenceInCalendarDays(new Date(trialEndsAt), new Date()))
      : null;

  async function postBilling(url: string, mode: "checkout" | "portal") {
    setLoading(mode);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Something went wrong", "error");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setLoading(null);
    }
  }

  const pill =
    status === "trialing" ? (
      <Badge variant="success">
        Free trial
        {trialDays != null ? ` · ${trialDays} day${trialDays === 1 ? "" : "s"} remaining` : ""}
      </Badge>
    ) : status === "active" ? (
      <Badge variant="success">Active — $10/month</Badge>
    ) : status === "past_due" ? (
      <Badge variant="warning">Payment failed</Badge>
    ) : (
      <Badge variant="flagged">No active plan</Badge>
    );

  const cta =
    status === "past_due" ? (
      <Button
        type="button"
        size="sm"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/portal", "portal")}
        className="bg-p-amber text-ink hover:bg-p-amber"
      >
        {loading === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Update payment method
      </Button>
    ) : status === "trialing" || status === "active" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/portal", "portal")}
      >
        {loading === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Manage subscription
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/checkout", "checkout")}
      >
        {loading === "checkout" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Start free trial
      </Button>
    );

  return (
    <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-ink">Billing</h3>
            {pill}
          </div>
          {status === "past_due" ? (
            <p className="text-[13px] font-medium text-ink">Update your card to restore full access.</p>
          ) : status === "trialing" || status === "active" ? (
            <p className="text-[13px] text-ink-2">
              {status === "trialing"
                ? "Your trial includes full generation and publishing. Cancel anytime from the portal."
                : "You're on the Voce monthly plan."}
            </p>
          ) : (
            <p className="text-[13px] text-ink-2">
              Start a 14-day free trial, then $10/month. Generation and publishing require an active trial or subscription.
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">{cta}</div>
      </div>
    </div>
  );
}

function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("Deletion failed");
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/login");
    } catch {
      showToast("Deletion failed - please try again", "error");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-medium text-destructive">Are you sure? This cannot be undone.</p>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
          <span className="flex items-center gap-1.5">
            {deleting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Deleting...
              </>
            ) : (
              "Yes, delete my account"
            )}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
      Delete account
    </Button>
  );
}

function VoiceRow({
  label,
  value,
  editable,
  multiline,
  onEdit,
  selectOptions,
  selectValue,
}: {
  label: string;
  value: ReactNode;
  editable?: boolean;
  multiline?: boolean;
  onEdit?: (val: string) => void | Promise<void>;
  selectOptions?: { value: string; label: string }[];
  selectValue?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(typeof value === "string" ? value : "");

  useEffect(() => {
    if (selectOptions) return;
    if (typeof value === "string") setEditValue(value);
  }, [value, selectOptions]);

  return (
    <div className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-paper-sunk">
      <span className="w-36 flex-shrink-0 pt-0.5 text-[12px] font-medium text-ink-2">{label}</span>
      <div className="min-w-0 flex-1">
        {editing && editable && onEdit ? (
          <div className="space-y-1.5">
            {selectOptions?.length ? (
              <select
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-full rounded-[10px] border-2 border-ink bg-surface px-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-solid"
                autoFocus
              >
                {selectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : multiline ? (
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="min-h-[72px] resize-none px-2 py-1.5 text-[13px]"
                autoFocus
              />
            ) : (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 px-2 text-[13px]"
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={async () => {
                  await onEdit(editValue);
                  setEditing(false);
                }}
                className="font-medium text-accent-solid"
              >
                Save
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {typeof value === "string" ? (
              <span className="text-[13px] leading-relaxed text-ink">
                {value || <span className="text-ink-3">Not detected</span>}
              </span>
            ) : (
              value
            )}
            {editable && onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (selectOptions?.length) {
                    setEditValue(selectValue ?? selectOptions[0]?.value ?? "");
                  } else {
                    setEditValue(typeof value === "string" ? value : "");
                  }
                  setEditing(true);
                }}
                className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                Edit
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceSuggestionsPanel({
  topicId,
  state,
  onToggle,
  onApply,
  onDismiss,
}: {
  topicId: string;
  state: SourceSuggestionState;
  onToggle: (url: string) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  void topicId;
  if (state.kind === "loading") {
    return (
      <div className="mt-2 rounded-[10px] border border-hairline bg-paper-sunk p-3 text-[12px] text-ink-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Looking up sources...
        </div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mt-2 rounded-[10px] border-2 border-ink bg-[color:var(--status-error-bg)] p-3 text-[12px] text-ink">
        <div className="flex items-start justify-between gap-3">
          <span>{state.message}</span>
          <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }
  const selectedCount = state.candidates.filter((c) => state.selected[c.url]).length;
  return (
    <div className="mt-2 space-y-2 rounded-[10px] border border-hairline bg-paper-sunk p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">
          Suggested sources ({state.candidates.length})
        </span>
        {state.stats ? (
          <span className="text-[11px] text-ink-3">
            {state.stats.validated}/{state.stats.requested} validated
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {state.candidates.map((c) => (
          <label key={c.url} className="flex items-start gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={Boolean(state.selected[c.url])}
              onChange={() => onToggle(c.url)}
              className="mt-0.5 accent-accent-solid"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-ink">{c.name}</span>
                <span className="truncate text-[11px] text-ink-2">{c.url}</span>
              </div>
              {c.why ? <p className="text-[11px] text-ink-2">{c.why}</p> : null}
            </div>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button size="sm" onClick={onApply} disabled={selectedCount === 0}>
          Add {selectedCount > 0 ? `${selectedCount} ` : ""}selected
        </Button>
      </div>
    </div>
  );
}

export default function SettingsClient({ subscription }: { subscription: SettingsSubscriptionSnapshot }) {
  const [rawDescription, setRawDescription] = useState("");
  const [personalContext, setPersonalContext] = useState("");
  const [samplePosts, setSamplePosts] = useState<string[]>([""]);
  const [sentenceLength, setSentenceLength] = useState<string | null>(null);
  const [hookStyle, setHookStyle] = useState<string | null>(null);
  const [pov, setPov] = useState<string | null>(null);
  const [toneMarkers, setToneMarkers] = useState<string[]>([]);
  const [formattingStyle, setFormattingStyle] = useState<string | null>(null);
  const [calibrationQuality, setCalibrationQuality] = useState<string>("uncalibrated");
  const [samplePostCount, setSamplePostCount] = useState(0);
  const [signaturePhrases, setSignaturePhrases] = useState<string[]>([]);
  const [neverPatterns, setNeverPatterns] = useState<string[]>([]);
  const [postStructureTemplate, setPostStructureTemplate] = useState("");
  const [avgSentenceLengthWords, setAvgSentenceLengthWords] = useState<number | null>(null);
  const [avgWordsPerPost, setAvgWordsPerPost] = useState<number | null>(null);
  const [paragraphStyle, setParagraphStyle] = useState<string | null>(null);
  const [emojiFrequency, setEmojiFrequency] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [personalContextComponents, setPersonalContextComponents] = useState<string[]>([]);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [emojiNeverOverride, setEmojiNeverOverride] = useState(false);
  const [newSignaturePhrase, setNewSignaturePhrase] = useState("");
  const [newNeverPattern, setNewNeverPattern] = useState("");
  const [userBannedWords, setUserBannedWords] = useState<string[]>([]);
  const [bannedWordDraft, setBannedWordDraft] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [linkedinToken, setLinkedinToken] = useState<LinkedInTokenView | null>(null);
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings>({
    cadenceMode: "daily",
    draftsPerDay: 3,
    preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
    preferredTime: "09:00",
    timezone: "UTC",
    jitterMinutes: 15,
  });
  const [tellFlagNumberedLists, setTellFlagNumberedLists] = useState<"always" | "three_plus" | "never">("three_plus");
  const [tellFlags, setTellFlags] = useState({
    tellFlagBannedWords: true,
    tellFlagEmDash: true,
    tellFlagEngagementBeg: true,
    tellFlagEveryLine: true,
  });
  const [savingTellSettings, setSavingTellSettings] = useState(false);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [suggestingTopicIndex, setSuggestingTopicIndex] = useState<number | null>(null);
  const [sourceSuggestions, setSourceSuggestions] = useState<Record<string, SourceSuggestionState>>({});
  const [activeSection, setActiveSection] = useState<
    "voice" | "topics" | "scheduling" | "linkedin" | "billing" | "account"
  >("voice");
  const { showToast } = useToast();
  const hasHydratedVoiceTextFields = useRef(false);
  const touchedVoiceTextFields = useRef({
    rawDescription: false,
    userNotes: false,
    personalContext: false,
  });

  function applyVoiceProfileFromApi(vp: Record<string, unknown> | null | undefined) {
    if (!vp) return;
    const incomingRawDescription = (vp.rawDescription as string) ?? "";
    const incomingUserNotes = (vp.userNotes as string) ?? "";
    const incomingPersonalContext = (vp.personalContext as string) ?? "";
    if (!hasHydratedVoiceTextFields.current) {
      setRawDescription(incomingRawDescription);
      setUserNotes(incomingUserNotes);
      setPersonalContext(incomingPersonalContext);
      hasHydratedVoiceTextFields.current = true;
    } else {
      if (!touchedVoiceTextFields.current.rawDescription) {
        setRawDescription(incomingRawDescription);
      }
      if (!touchedVoiceTextFields.current.userNotes) {
        setUserNotes(incomingUserNotes);
      }
      if (!touchedVoiceTextFields.current.personalContext) {
        setPersonalContext(incomingPersonalContext);
      }
    }
    setPersonalContextComponents(((vp.personalContextComponents as string[] | null) ?? []).filter(Boolean));
    setSamplePosts(parseLoadedSamplePosts(vp.samplePosts as string[] | undefined));
    setSentenceLength((vp.sentenceLength as string | null) ?? null);
    setHookStyle((vp.hookStyle as string | null) ?? null);
    setPov((vp.pov as string | null) ?? null);
    setToneMarkers((vp.toneMarkers as string[]) ?? []);
    setFormattingStyle((vp.formattingStyle as string | null) ?? null);
    setCalibrationQuality((vp.calibrationQuality as string) ?? "uncalibrated");
    setSamplePostCount((vp.samplePostCount as number) ?? 0);
    setSignaturePhrases((vp.signaturePhrases as string[]) ?? []);
    setNeverPatterns((vp.neverPatterns as string[]) ?? []);
    setPostStructureTemplate((vp.postStructureTemplate as string) ?? "");
    setAvgSentenceLengthWords((vp.avgSentenceLengthWords as number | null) ?? null);
    setAvgWordsPerPost((vp.avgWordsPerPost as number | null) ?? null);
    setParagraphStyle((vp.paragraphStyle as string | null) ?? null);
    const extracted = vp.extractedPatterns as { emojiFrequency?: string } | null | undefined;
    setEmojiFrequency(extracted?.emojiFrequency ?? null);
    setEmojiNeverOverride(Boolean(vp.emojiNeverOverride));
    setUserBannedWords((vp.userBannedWords as string[]) ?? []);
  }

  useEffect(() => {
    fetch("/api/voice")
      .then((r) => r.json())
      .then((d) => applyVoiceProfileFromApi(d.voiceProfile));

    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => {
        const existingTopics = (d.topics ?? []) as TopicRow[];
        setTopics(
          existingTopics.length > 0
            ? existingTopics.map((topic) => ({
                id: topic.id,
                topicLabel: topic.topicLabel ?? "",
                tavilyQuery: topic.tavilyQuery ?? "",
                sourceUrls: topic.sourceUrls ?? [],
                priorityWeight: topic.priorityWeight ?? 3,
                lastSavedTopicLabel: topic.topicLabel ?? "",
                querySuggested: false,
              }))
            : [{ topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3, lastSavedTopicLabel: "", querySuggested: false }],
        );
      });

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLinkedinToken((d.linkedinToken ?? null) as LinkedInTokenView | null);
        setSchedulingSettings({
          cadenceMode: d.settings?.cadenceMode ?? "daily",
          draftsPerDay: d.settings?.draftsPerDay ?? 3,
          preferredDays: d.settings?.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"],
          preferredTime: d.settings?.preferredTime ?? "09:00",
          timezone: d.settings?.timezone ?? "UTC",
          jitterMinutes: d.settings?.jitterMinutes ?? 15,
        });
        setTellFlagNumberedLists(d.settings?.tellFlagNumberedLists ?? "three_plus");
        setTellFlags({
          tellFlagBannedWords: d.settings?.tellFlagBannedWords ?? true,
          tellFlagEmDash: d.settings?.tellFlagEmDash ?? true,
          tellFlagEngagementBeg: d.settings?.tellFlagEngagementBeg ?? true,
          tellFlagEveryLine: d.settings?.tellFlagEveryLine ?? true,
        });
      })
      .catch(() => setLinkedinToken(null));
  }, []);

  useEffect(() => {
    const sectionIds = ["voice", "topics", "scheduling", "linkedin", "billing", "account"] as const;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.id as typeof sectionIds[number];
        setActiveSection(id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  async function persistVoiceAndRefresh(): Promise<{ ok: boolean; error?: string }> {
    const trimmed = samplePosts.map((p) => p.trim()).filter(Boolean);
    const response = await fetch("/api/voice", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawDescription, samplePosts: trimmed, personalContext }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error };
    }
    const data = await fetch("/api/voice").then((r) => r.json());
    applyVoiceProfileFromApi(data.voiceProfile);
    return { ok: true };
  }

  async function saveVoice() {
    const result = await persistVoiceAndRefresh();
    showToast(
      result.ok ? "Voice profile saved" : (result.error ?? "Failed to save"),
      result.ok ? "success" : "error",
    );
  }

  async function reExtractPersonalContext() {
    if (isReExtracting) return;
    setIsReExtracting(true);
    try {
      const response = await fetch("/api/voice/extract-personal-context", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        components?: string[];
        count?: number;
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        if (data.code === "NO_PERSONAL_CONTEXT") {
          showToast("Save personal context first, then re-extract", "error");
        } else {
          showToast(data.error ?? "Failed to extract", "error");
        }
        return;
      }
      const components = data.components ?? [];
      setPersonalContextComponents(components);
      showToast(`Extracted ${components.length} component${components.length === 1 ? "" : "s"}`, "success");
    } catch {
      showToast("Failed to extract", "error");
    } finally {
      setIsReExtracting(false);
    }
  }

  function addPost() {
    setSamplePosts((prev) => [...prev, ""]);
  }

  function removePost(index: number) {
    setSamplePosts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updatePost(index: number, value: string) {
    setSamplePosts((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  const updateTopic = (index: number, field: keyof TopicRow, value: string | string[] | number | boolean | undefined) => {
    setTopics((prev) => prev.map((topic, i) => (i === index ? { ...topic, [field]: value } : topic)));
  };

  async function patchTopicById(topicId: string, payload: Partial<Pick<TopicRow, "topicLabel" | "tavilyQuery" | "sourceUrls" | "priorityWeight">>) {
    // Topic updates route path: /api/topics?id=<topicId>
    const response = await fetch(`/api/topics?id=${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    console.log("PATCH /api/topics response", { ok: response.ok, status: response.status, data });
    return { response, data };
  }

  async function triggerSourceSuggestions(topicIndex: number) {
    const topic = topics[topicIndex];
    if (!topic?.id) return;
    const topicId = topic.id;
    setSourceSuggestions((prev) => ({ ...prev, [topicId]: { kind: "loading" } }));
    try {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/suggest-sources`, {
        method: "POST",
      });
      if (!response.ok) {
        setSourceSuggestions((prev) => ({
          ...prev,
          [topicId]: { kind: "error", message: "Could not fetch suggestions." },
        }));
        return;
      }
      const data = (await response.json()) as {
        candidates?: SuggestedSourceCandidate[];
        stats?: { requested: number; validated: number };
      };
      const candidates = data.candidates ?? [];
      if (candidates.length === 0) {
        setSourceSuggestions((prev) => ({
          ...prev,
          [topicId]: {
            kind: "error",
            message: "No high-confidence sources found. Try adjusting the topic label or adding URLs manually.",
          },
        }));
        return;
      }
      const selected: Record<string, boolean> = {};
      for (const c of candidates) selected[c.url] = true;
      setSourceSuggestions((prev) => ({
        ...prev,
        [topicId]: { kind: "results", candidates, selected, stats: data.stats },
      }));
    } catch {
      setSourceSuggestions((prev) => ({
        ...prev,
        [topicId]: { kind: "error", message: "Could not fetch suggestions." },
      }));
    }
  }

  function toggleSourceCandidate(topicId: string, url: string) {
    setSourceSuggestions((prev) => {
      const state = prev[topicId];
      if (!state || state.kind !== "results") return prev;
      return {
        ...prev,
        [topicId]: { ...state, selected: { ...state.selected, [url]: !state.selected[url] } },
      };
    });
  }

  function dismissSourceSuggestions(topicId: string) {
    setSourceSuggestions((prev) => {
      const next = { ...prev };
      delete next[topicId];
      return next;
    });
  }

  async function applySourceSuggestions(topicIndex: number) {
    const topic = topics[topicIndex];
    if (!topic?.id) return;
    const topicId = topic.id;
    const state = sourceSuggestions[topicId];
    if (!state || state.kind !== "results") return;

    const existing = new Set(topic.sourceUrls.map(normaliseSourceUrlForCompare));
    const additions: string[] = [];
    for (const c of state.candidates) {
      if (!state.selected[c.url]) continue;
      const norm = normaliseSourceUrlForCompare(c.url);
      if (existing.has(norm)) continue;
      existing.add(norm);
      additions.push(c.url);
    }
    if (additions.length === 0) {
      dismissSourceSuggestions(topicId);
      return;
    }

    const merged = [...topic.sourceUrls, ...additions];
    const { response } = await patchTopicById(topicId, { sourceUrls: merged });
    if (!response.ok) {
      showToast("Failed to add sources", "error");
      return;
    }
    setTopics((prev) => prev.map((row, i) => (i === topicIndex ? { ...row, sourceUrls: merged } : row)));
    dismissSourceSuggestions(topicId);
    showToast(`${additions.length} source${additions.length === 1 ? "" : "s"} added`, "success");
  }

  async function saveTopicRow(index: number): Promise<boolean> {
    const topic = topics[index];
    if (!topic) return false;

    const payload = {
      topicLabel: topic.topicLabel.trim(),
      tavilyQuery: topic.tavilyQuery.trim(),
      sourceUrls: topic.sourceUrls.map((url) => url.trim()).filter(Boolean),
      priorityWeight: topic.priorityWeight ?? 3,
    };

    if (!payload.topicLabel || !payload.tavilyQuery) {
      showToast("Topic name and query are required", "error");
      return false;
    }

    if (topic.id) {
      const { response, data } = await patchTopicById(topic.id, payload);
      if (!response.ok) {
        showToast("Failed to save topic", "error");
        console.log("Topic save error payload", data);
        return false;
      }
      setTopics((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                ...(data.topic ?? {}),
                topicLabel: data.topic?.topicLabel ?? payload.topicLabel,
                tavilyQuery: data.topic?.tavilyQuery ?? payload.tavilyQuery,
                sourceUrls: data.topic?.sourceUrls ?? payload.sourceUrls,
                priorityWeight: data.topic?.priorityWeight ?? payload.priorityWeight,
                lastSavedTopicLabel: data.topic?.topicLabel ?? payload.topicLabel,
              }
            : row,
        ),
      );
      showToast("Topic saved");
      return true;
    }

    const createResponse = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicLabel: payload.topicLabel,
        tavilyQuery: payload.tavilyQuery,
        sourceUrls: payload.sourceUrls,
        priorityWeight: payload.priorityWeight,
        tavilyQueryConfirmed: true,
      }),
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      showToast("Failed to save topic", "error");
      console.log("POST /api/topics response", { ok: createResponse.ok, status: createResponse.status, data: createData });
      return false;
    }
    setTopics((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              id: createData.topic?.id ?? row.id,
              lastSavedTopicLabel: createData.topic?.topicLabel ?? payload.topicLabel,
              priorityWeight: createData.topic?.priorityWeight ?? payload.priorityWeight,
            }
          : row,
      ),
    );
    showToast("Topic saved");
    return true;
  }

  async function suggestTopicQuery(index: number) {
    const topic = topics[index];
    if (!topic?.topicLabel.trim()) return;
    setSuggestingTopicIndex(index);
    try {
      const response = await fetch("/api/topics/suggest-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicLabel: topic.topicLabel.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.suggestedQuery) {
        throw new Error("suggestion_failed");
      }
      setTopics((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, tavilyQuery: data.suggestedQuery, querySuggested: true } : row,
        ),
      );
    } catch {
      showToast("Couldn't suggest a query — try typing one manually", "error");
    } finally {
      setSuggestingTopicIndex(null);
    }
  }

  async function saveTopics() {
    const operations = topics.map(async (topic, index) => {
      const trimmedLabel = topic.topicLabel.trim();
      const trimmedQuery = topic.tavilyQuery.trim();
      if (!trimmedLabel || !trimmedQuery) return true;
      return saveTopicRow(index);
    });
    const results = await Promise.all(operations);
    if (results.every(Boolean)) {
      showToast("Topics saved");
    } else {
      showToast("Failed to save", "error");
    }
  }

  async function saveOverrides() {
    const response = await fetch("/api/voice/overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userBannedWords,
        userNotes: userNotes.trim() ? userNotes : "",
      }),
    });
    showToast(response.ok ? "Preferences saved" : "Failed to save", response.ok ? "success" : "error");
  }

  // Optimistic add/remove for the banned-words chip list. Updates state
  // immediately so the chip appears/disappears on the next paint, fires the
  // PATCH in the background, and reverts the state if the network call fails.
  async function patchBannedWords(next: string[]): Promise<boolean> {
    try {
      const response = await fetch("/api/voice/overrides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userBannedWords: next }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function handleAddBannedWord() {
    const result = addBannedWord(userBannedWords, bannedWordDraft);
    if (!result.ok) {
      if (result.reason === "duplicate") showToast("Already in your list", "error");
      else if (result.reason === "too_long") showToast("Word too long (50 char max)", "error");
      else if (result.reason === "limit") showToast("Maximum 50 banned words", "error");
      // empty → silent no-op
      return;
    }
    const previous = userBannedWords;
    setUserBannedWords(result.next);
    setBannedWordDraft("");
    const ok = await patchBannedWords(result.next);
    if (!ok) {
      setUserBannedWords(previous);
      showToast(`Couldn't add "${result.added}"`, "error");
    }
  }

  async function handleRemoveBannedWord(index: number) {
    const previous = userBannedWords;
    const next = removeBannedWord(userBannedWords, index);
    if (next === previous) return;
    setUserBannedWords(next);
    const ok = await patchBannedWords(next);
    if (!ok) {
      setUserBannedWords(previous);
      showToast("Couldn't remove word", "error");
    }
  }

  async function patchVoiceOverrides(payload: {
    signaturePhrases?: string[];
    neverPatterns?: string[];
    postStructureTemplate?: string;
    emojiNeverOverride?: boolean;
    hookStyle?: string;
    paragraphStyle?: string;
    toneMarkers?: string[];
    emojiFrequency?: string;
  }) {
    const response = await fetch("/api/voice/overrides", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      showToast("Failed to save", "error");
    }
  }

  async function removeSignaturePhrase(index: number) {
    const next = signaturePhrases.filter((_, i) => i !== index);
    setSignaturePhrases(next);
    await patchVoiceOverrides({ signaturePhrases: next });
  }

  async function removeNeverPattern(index: number) {
    const next = neverPatterns.filter((_, i) => i !== index);
    setNeverPatterns(next);
    await patchVoiceOverrides({ neverPatterns: next });
  }

  async function handleReanalyze() {
    const n = samplePosts.filter((p) => p.trim().length >= 100).length;
    if (n < 3) return;
    setIsExtracting(true);
    try {
      const result = await persistVoiceAndRefresh();
      showToast(
        result.ok ? "Posts re-analysed" : (result.error ?? "Failed to re-analyse"),
        result.ok ? "success" : "error",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  const toggleTellFlag = (key: keyof typeof tellFlags) => {
    setTellFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function handleSaveTellSettings() {
    setSavingTellSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tellFlagNumberedLists,
          tellFlagBannedWords: tellFlags.tellFlagBannedWords,
          tellFlagEmDash: tellFlags.tellFlagEmDash,
          tellFlagEngagementBeg: tellFlags.tellFlagEngagementBeg,
          tellFlagEveryLine: tellFlags.tellFlagEveryLine,
        }),
      });
      showToast(response.ok ? "Content style preferences saved" : "Failed to save", response.ok ? "success" : "error");
    } finally {
      setSavingTellSettings(false);
    }
  }

  const validPostCount = samplePosts.filter((p) => p.trim().length >= 100).length;
  const sampleCount = Math.max(samplePostCount, validPostCount);

  const calibrationUi =
    calibrationQuality === "full"
      ? { label: "FULL ✓", variant: "success" as const, nudge: "Voice fully calibrated. Add posts anytime to keep it current." }
      : calibrationQuality === "mostly"
        ? { label: "MOSTLY ◐", variant: "warning" as const, nudge: "Almost there - add 1-2 more posts to reach full calibration." }
        : calibrationQuality === "partial"
          ? { label: "PARTIAL ◑", variant: "warning" as const, nudge: "Add more posts for better accuracy. 8+ posts recommended." }
          : { label: "UNCALIBRATED ○", variant: "flagged" as const, nudge: "Add at least 3 posts to start calibrating your voice." };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display-3 text-ink">Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">Manage voice, topics, scheduling, and LinkedIn connection</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="sticky top-6 hidden self-start lg:block">
          <div className="space-y-1 rounded-[10px] border-2 border-ink bg-surface p-2 shadow-nav">
            {[
              { id: "voice", label: "Voice Profile" },
              { id: "topics", label: "Topics" },
              { id: "scheduling", label: "Scheduling" },
              { id: "linkedin", label: "LinkedIn" },
              ...(isBillingEnabled() ? [{ id: "billing", label: "Billing" }] : []),
              { id: "account", label: "Account" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "block rounded-md border-2 px-3 py-1.5 text-[13px] transition-colors",
                  activeSection === item.id
                    ? "border-ink bg-p-blue font-medium text-ink"
                    : "border-transparent text-ink-2 hover:bg-paper-sunk hover:text-ink",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          <section id="voice" className="scroll-mt-6 space-y-4">
            <div className="border-b-2 border-ink pb-3">
              <h2 className="font-display text-[18px] font-bold text-ink">Voice Profile</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">How your posts should sound</p>
            </div>

            <div className="space-y-5 rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between rounded-[10px] border border-hairline bg-paper-sunk p-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-medium text-ink">Voice</span>
                  <Badge variant={calibrationUi.variant}>{calibrationUi.label}</Badge>
                  <span className="text-[12px] text-ink-2">
                    {sampleCount} sample post{sampleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="hidden text-[12px] text-ink-2 md:block">{calibrationUi.nudge}</span>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-[13px] text-ink">Sample posts</Label>
                  <p className="text-[12px] text-ink-3">
                    Add your best LinkedIn posts. The more you add, the more accurate your voice profile.
                  </p>
                </div>
                <div className="space-y-3">
                  {samplePosts.map((post, index) => (
                    <div key={index} className="overflow-hidden rounded-[10px] border-2 border-ink bg-surface focus-within:ring-2 focus-within:ring-accent-solid">
                      <div className="flex items-center justify-between border-b border-hairline bg-paper-sunk px-3 py-1.5">
                        <span className="eyebrow text-ink-2">Post {index + 1}</span>
                        {samplePosts.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removePost(index)}
                            className="hover:text-destructive"
                            aria-label={`Remove post ${index + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      <textarea
                        value={post}
                        onChange={(e) => updatePost(index, e.target.value)}
                        placeholder="Paste your LinkedIn post here..."
                        rows={4}
                        maxLength={3000}
                        className="w-full resize-none border-0 bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
                      />
                      {post.length > 0 && post.length < 100 ? (
                        <p className="px-3 pb-2 text-[11px] font-medium text-ink-2">
                          Post is too short — add more content for better voice extraction
                        </p>
                      ) : null}
                      <div className="flex items-center justify-between border-t border-hairline bg-paper-sunk px-3 py-1.5">
                        <span className="text-[11px] text-ink-3">
                          Plain text only · LinkedIn posts work best
                        </span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            post.length > 3000
                              ? "text-destructive"
                              : post.length < 100
                                ? "text-ink-3"
                                : "text-[color:var(--status-success)]",
                          )}
                        >
                          {post.length} / 3000
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={addPost}
                  className="w-full gap-2 border-2 border-dashed border-ink text-ink-2"
                >
                  <Plus className="h-4 w-4" />
                  Add another post
                </Button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paper-sunk">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          validPostCount >= 8 ? "bg-p-sage" : validPostCount >= 3 ? "bg-p-amber" : "bg-hairline",
                        )}
                        style={{ width: `${Math.min((validPostCount / 8) * 100, 100)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "font-medium",
                        validPostCount >= 8 ? "text-[color:var(--status-success)]" : validPostCount >= 3 ? "text-ink" : "text-ink-3",
                      )}
                    >
                      {validPostCount} / 8 posts
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-2">Calibration: {validPostCount} of 8 recommended posts added</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-ink">Raw description</Label>
                  <p className="text-[12px] text-ink-3">Short plain-English description of your writing style</p>
                  <Textarea
                    rows={3}
                    maxLength={3000}
                    value={rawDescription}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.rawDescription = true;
                      setRawDescription(e.target.value);
                    }}
                    className="min-h-[84px] text-[13.5px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-ink">Tone markers</Label>
                  <p className="text-[12px] text-ink-3">Comma-separated tone keywords</p>
                  <Input
                    value={toneMarkers.join(", ")}
                    onChange={(e) =>
                      setToneMarkers(
                        e.target.value
                          .split(",")
                          .map((m) => m.trim())
                          .filter(Boolean),
                      )
                    }
                    className="text-[13.5px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-ink">Banned words</Label>
                  <p className="text-[12px] text-ink-3">
                    Banned words match exact form only. Add variants separately (e.g., &quot;leverage&quot;,
                    &quot;leveraging&quot;, &quot;leveraged&quot;).
                  </p>
                  {userBannedWords.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {userBannedWords.map((word, i) => (
                        <Chip
                          key={`banned-${i}-${word.slice(0, 12)}`}
                          tone="coral"
                          size="sm"
                          onRemove={() => handleRemoveBannedWord(i)}
                          removeLabel={`Remove banned word ${word}`}
                        >
                          {word}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  <Input
                    value={bannedWordDraft}
                    onChange={(e) => setBannedWordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddBannedWord();
                      }
                    }}
                    placeholder="Add a word or phrase, then press Enter"
                    autoComplete="off"
                    maxLength={50}
                    className="text-[13.5px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-ink">User notes</Label>
                  <p className="text-[12px] text-ink-3">Additional instructions for style constraints</p>
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={userNotes}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.userNotes = true;
                      setUserNotes(e.target.value);
                    }}
                    className="min-h-14 text-[13.5px]"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[13px] text-ink">Personal context</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={reExtractPersonalContext}
                      disabled={isReExtracting || !personalContext.trim()}
                      className="font-medium text-ink"
                    >
                      {isReExtracting ? "Extracting…" : "Re-extract components"}
                    </Button>
                  </div>
                  <p className="text-[12px] text-ink-3">
                    Specific, falsifiable experiences (not a generic bio). Examples: &quot;shipped 3 RAG
                    systems last year&quot;, &quot;led security at Stripe 2019-2022&quot;. Specifics power
                    targeted personalization on drafts.
                  </p>
                  <Textarea
                    rows={5}
                    maxLength={1500}
                    value={personalContext}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.personalContext = true;
                      setPersonalContext(e.target.value);
                    }}
                    className="min-h-[120px] text-[13.5px]"
                  />
                  {personalContextComponents.length > 0 ? (
                    <div className="space-y-1">
                      <p className="eyebrow text-ink-3">
                        Extracted components ({personalContextComponents.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {personalContextComponents.map((component, i) => (
                          <Chip
                            key={`${i}-${component.slice(0, 20)}`}
                            tone="neutral"
                            size="sm"
                            title={component}
                          >
                            {component.length > 60 ? `${component.slice(0, 60)}…` : component}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : personalContext.trim() ? (
                    <p className="text-[11px] text-ink-3">
                      No components extracted yet. Save the profile or click &quot;Re-extract components&quot;.
                    </p>
                  ) : null}
                </div>
              </div>

              {calibrationQuality !== "uncalibrated" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-[14px] font-bold text-ink">What we learned about your voice</h3>
                    <span className="text-[11px] text-ink-3">Edit anything that looks wrong</span>
                  </div>

                  <div className="divide-y divide-hairline overflow-hidden rounded-[10px] border-2 border-ink bg-surface">
                    <VoiceRow
                      label="Writing style"
                      value={formatWritingStyle({ avgSentenceLengthWords, avgWordsPerPost, paragraphStyle })}
                    />
                    <HookStyleVoiceRow
                      hookStyle={hookStyle}
                      onSave={async (v) => {
                        const next = v || null;
                        setHookStyle(next);
                        await patchVoiceOverrides({ hookStyle: v });
                      }}
                    />
                    <VoiceRow
                      label="Post structure"
                      value={postStructureTemplate}
                      editable
                      multiline
                      onEdit={async (val) => {
                        setPostStructureTemplate(val);
                        await patchVoiceOverrides({ postStructureTemplate: val });
                      }}
                    />
                    {neverPatterns.length > 0 ? (
                      <VoiceRow
                        label="You never..."
                        value={
                          <div className="flex flex-wrap gap-1.5">
                            {neverPatterns.map((pattern, i) => (
                              <Chip
                                key={`never-${i}-${pattern.slice(0, 12)}`}
                                tone="coral"
                                size="sm"
                                onRemove={() => removeNeverPattern(i)}
                                removeLabel={`Remove pattern ${pattern}`}
                              >
                                {pattern}
                              </Chip>
                            ))}
                          </div>
                        }
                      />
                    ) : null}
                    {signaturePhrases.length > 0 ? (
                      <VoiceRow
                        label="Your signature phrases"
                        value={
                          <div className="flex flex-wrap gap-1.5">
                            {signaturePhrases.map((phrase, i) => (
                              <Chip
                                key={`sig-${i}-${phrase.slice(0, 12)}`}
                                tone="blue"
                                size="sm"
                                onRemove={() => removeSignaturePhrase(i)}
                                removeLabel={`Remove phrase ${phrase}`}
                              >
                                {phrase}
                              </Chip>
                            ))}
                          </div>
                        }
                      />
                    ) : null}
                    <VoiceRow
                      label="Tone"
                      value={toneMarkers.length ? toneMarkers.join(", ") : ""}
                      editable
                      onEdit={async (val) => {
                        const next = val.split(",").map((t) => t.trim()).filter(Boolean);
                        setToneMarkers(next);
                        await patchVoiceOverrides({ toneMarkers: next });
                      }}
                    />
                    <VoiceRow
                      label="Emoji usage"
                      value={formatEmojiStyle(emojiFrequency)}
                      editable
                      selectOptions={[
                        { value: "none", label: "No emojis" },
                        { value: "rare", label: "Rarely uses emojis" },
                        { value: "occasional", label: "Occasionally uses emojis" },
                        { value: "frequent", label: "Frequently uses emojis" },
                      ]}
                      selectValue={emojiFrequency ?? "none"}
                      onEdit={async (val) => {
                        setEmojiFrequency(val);
                        await patchVoiceOverrides({ emojiFrequency: val });
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-ink-2">Add signature phrase</p>
                      <div className="flex gap-2">
                        <Input
                          value={newSignaturePhrase}
                          onChange={(e) => setNewSignaturePhrase(e.target.value)}
                          className="h-8 text-[12px]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const phrase = newSignaturePhrase.trim();
                            if (!phrase) return;
                            const next = [...signaturePhrases, phrase];
                            setSignaturePhrases(next);
                            setNewSignaturePhrase("");
                            await patchVoiceOverrides({ signaturePhrases: next });
                          }}
                          className="shrink-0"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-ink-2">Add never pattern</p>
                      <div className="flex gap-2">
                        <Input
                          value={newNeverPattern}
                          onChange={(e) => setNewNeverPattern(e.target.value)}
                          className="h-8 text-[12px]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const pattern = newNeverPattern.trim();
                            if (!pattern) return;
                            const next = [...neverPatterns, pattern];
                            setNeverPatterns(next);
                            setNewNeverPattern("");
                            await patchVoiceOverrides({ neverPatterns: next });
                          }}
                          className="shrink-0"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleReanalyze()}
                    disabled={isExtracting || validPostCount < 3}
                    className="hover:text-accent-solid"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Re-analysing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        Re-analyse my posts
                      </>
                    )}
                  </Button>
                </div>
              ) : null}

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[13px] font-medium text-ink">Never use emojis</p>
                  <p className="text-[12px] text-ink-3">Override all emoji generation</p>
                </div>
                <Switch
                  aria-label="Never use emojis"
                  checked={emojiNeverOverride}
                  onCheckedChange={async (next) => {
                    setEmojiNeverOverride(next);
                    await patchVoiceOverrides({ emojiNeverOverride: next });
                  }}
                />
              </div>

              <div className="border-t border-hairline pt-4">
                <p className="eyebrow mb-3 text-ink-2">Content style scanner preferences</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[
                      { value: "always", label: "Always flag" },
                      { value: "three_plus", label: "Flag if >3 items" },
                      { value: "never", label: "Never flag" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={tellFlagNumberedLists === opt.value}
                        onClick={() => setTellFlagNumberedLists(opt.value as "always" | "three_plus" | "never")}
                        className={cn(
                          tellFlagNumberedLists === opt.value && "bg-p-blue text-ink hover:bg-p-blue",
                        )}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  {[
                    { key: "tellFlagBannedWords", label: "Banned words" },
                    { key: "tellFlagEmDash", label: "Em dash overuse" },
                    { key: "tellFlagEngagementBeg", label: "Engagement begs" },
                    { key: "tellFlagEveryLine", label: "Every-line-break format" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between border-b border-hairline py-2 last:border-0">
                      <p className="text-[13px] text-ink">{item.label}</p>
                      <Switch
                        aria-label={item.label}
                        checked={tellFlags[item.key as keyof typeof tellFlags]}
                        onCheckedChange={() => toggleTellFlag(item.key as keyof typeof tellFlags)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={saveOverrides}>
                Save Voice Overrides
              </Button>
              <Button variant="outline" onClick={handleSaveTellSettings} disabled={savingTellSettings}>
                Save Style Preferences
              </Button>
              <Button onClick={saveVoice}>Save Voice Profile</Button>
            </div>
          </section>

          <section id="topics" className="scroll-mt-6 space-y-4">
            <div className="border-b-2 border-ink pb-3">
              <h2 className="font-display text-[18px] font-bold text-ink">Topics</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">What you want to post about</p>
            </div>
            <div className="space-y-4 rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              {topics.map((topic, i) => (
                <div
                  key={topic.id ?? i}
                  className="space-y-3 rounded-[10px] border border-hairline bg-surface p-4 transition-colors hover:border-ink-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-success)]" />
                      <span className="text-[13.5px] font-medium text-ink">{topic.topicLabel || "Untitled topic"}</span>
                    </div>
                    {topics.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))}
                        className="hover:text-destructive"
                        aria-label="Remove topic"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="eyebrow text-ink-2">Topic label</label>
                      <Input
                        type="text"
                        value={topic.topicLabel}
                        onChange={(e) => updateTopic(i, "topicLabel", e.target.value)}
                        className="h-8 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="eyebrow text-ink-2">Search query</label>
                        {topic.topicLabel.trim() &&
                        (!topic.tavilyQuery.trim() || topic.topicLabel.trim() !== (topic.lastSavedTopicLabel ?? "").trim()) ? (
                          <Button
                            type="button"
                            variant="link"
                            size="xs"
                            onClick={() => suggestTopicQuery(i)}
                            disabled={suggestingTopicIndex === i}
                          >
                            {suggestingTopicIndex === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Suggest
                          </Button>
                        ) : null}
                      </div>
                      <Input
                        type="text"
                        value={topic.tavilyQuery}
                        onChange={(e) => {
                          updateTopic(i, "tavilyQuery", e.target.value);
                          updateTopic(i, "querySuggested", false);
                        }}
                        className={cn(
                          "h-8 text-[13px]",
                          topic.querySuggested && "bg-[color:var(--status-warning-bg)]",
                        )}
                      />
                      {topic.querySuggested ? <p className="text-[11px] font-medium text-ink-2">AI suggested - edit if needed</p> : null}
                    </div>
                    <div className="space-y-1">
                      <label className="eyebrow text-ink-2">Source URLs</label>
                      <Input
                        value={topic.sourceUrls.join(", ")}
                        onChange={(e) =>
                          updateTopic(
                            i,
                            "sourceUrls",
                            e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="https://example.com/feed, ..."
                        className="h-8 text-[13px]"
                      />
                      <p className="text-[11px] text-ink-3">RSS feeds or blogs, comma separated</p>
                      {AUTO_SUGGEST_SOURCES_ENABLED && topic.id && topic.sourceUrls.length === 0 && !sourceSuggestions[topic.id] ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => triggerSourceSuggestions(i)}
                          className="mt-1 text-accent-solid"
                        >
                          <Sparkles className="h-3 w-3" />
                          Suggest sources
                        </Button>
                      ) : null}
                      {topic.id && sourceSuggestions[topic.id] ? (
                        <SourceSuggestionsPanel
                          topicId={topic.id}
                          state={sourceSuggestions[topic.id]}
                          onToggle={(url) => toggleSourceCandidate(topic.id!, url)}
                          onApply={() => applySourceSuggestions(i)}
                          onDismiss={() => dismissSourceSuggestions(topic.id!)}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-ink-2">Priority</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((weight) => (
                          <button
                            key={weight}
                            type="button"
                            onClick={async () => {
                              updateTopic(i, "priorityWeight", weight);
                              const topicId = topics[i]?.id;
                              if (!topicId) return;
                              const { response } = await patchTopicById(topicId, { priorityWeight: weight });
                              if (!response.ok) showToast("Failed to update priority", "error");
                            }}
                            aria-pressed={(topic.priorityWeight ?? 3) === weight}
                            className={cn(
                              chipVariants({
                                tone: (topic.priorityWeight ?? 3) === weight ? "accent" : "surface",
                                variant: (topic.priorityWeight ?? 3) === weight ? "solid" : "dashed",
                                size: "sm",
                                interactive: true,
                              }),
                              "w-7 justify-center px-0",
                            )}
                          >
                            {weight}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => saveTopicRow(i)}>
                      Save
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setTopics((prev) => [
                    ...prev,
                    { topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3, lastSavedTopicLabel: "", querySuggested: false },
                  ])
                }
                className="w-full gap-2 border-2 border-dashed border-ink text-ink-2"
              >
                <Plus className="h-4 w-4" />
                Add topic
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveTopics}>Save Topics</Button>
            </div>
          </section>

          <section id="scheduling" className="scroll-mt-6 space-y-4">
            <div className="border-b-2 border-ink pb-3">
              <h2 className="font-display text-[18px] font-bold text-ink">Scheduling</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">When approved posts are published</p>
            </div>
            <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              <SchedulingForm initialSettings={schedulingSettings} />
            </div>
          </section>

          <section id="linkedin" className="scroll-mt-6 space-y-4">
            <div className="border-b-2 border-ink pb-3">
              <h2 className="font-display text-[18px] font-bold text-ink">LinkedIn</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">Connection status for publishing</p>
            </div>
            <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              {!linkedinToken ? (
                <div className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-[color:var(--status-error-bg)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-destructive">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-ink">LinkedIn not connected</p>
                      <p className="text-[12px] text-ink-2">Connect to enable publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Connect
                  </a>
                </div>
              ) : linkedinToken.status === "active" ? (
                <div className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-[color:var(--status-success-bg)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-accent-solid">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-ink">LinkedIn connected</p>
                      <p className="text-[12px] text-ink-2">
                        Token expires {formatDistanceToNow(new Date(linkedinToken.tokenExpiry), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Reconnect
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-[color:var(--status-error-bg)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-destructive">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-ink">LinkedIn token expired</p>
                      <p className="text-[12px] text-ink-2">Reconnect to resume publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Reconnect now
                  </a>
                </div>
              )}
            </div>
          </section>

          {isBillingEnabled() ? (
            <section id="billing" className="scroll-mt-6 space-y-4">
              <div className="border-b-2 border-ink pb-3">
                <h2 className="font-display text-[18px] font-bold text-ink">Billing</h2>
                <p className="mt-0.5 text-[13px] text-ink-2">Subscription and payments</p>
              </div>
              <BillingCard subscription={subscription} />
            </section>
          ) : null}

          <section id="account" className="scroll-mt-6 space-y-4">
            <div className="border-b-2 border-ink pb-3">
              <h2 className="font-display text-[18px] font-bold text-ink">Account</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">Manage your data and account</p>
            </div>

            <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-[15px] font-bold text-ink">Export your data</h3>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    Download all your drafts, posts, voice profile, topics, and activity as a JSON file.
                  </p>
                </div>
                <ExportButton />
              </div>
            </div>

            <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card">
              <h3 className="mb-1 font-display text-[15px] font-bold text-destructive">Danger zone</h3>
              <p className="mb-4 text-[13px] text-ink-2">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
              <DeleteAccountButton />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
