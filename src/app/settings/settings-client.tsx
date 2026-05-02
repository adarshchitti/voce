"use client";

import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import type { SubscriptionStatus } from "@/lib/subscription";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { SchedulingForm, type SchedulingSettings } from "@/components/SchedulingForm";
import { cn } from "@/lib/utils";

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
    <div className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-[#FAFAFA]">
      <span className="w-36 flex-shrink-0 pt-0.5 text-[12px] font-medium text-[#9CA3AF]">How you open posts</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded-md border border-[#2563EB] bg-white px-2 py-1.5 text-[13px] text-[#374151] outline-none"
            >
              {HOOK_STYLE_PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="__custom__">Custom (free text)</option>
            </select>
            {preset === "__custom__" ? (
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Describe how you usually open posts"
                className="w-full rounded-md border border-[#2563EB] px-2 py-1 text-[13px] text-[#374151] outline-none"
                autoFocus
              />
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const v = preset === "__custom__" ? customText.trim() : preset;
                  await onSave(v);
                  setEditing(false);
                }}
                className="text-[11px] font-medium text-[#2563EB]"
              >
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-[#9CA3AF]">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "text-[13px] leading-relaxed",
                hookStyle ? "text-[#374151]" : "text-[#9CA3AF]",
              )}
            >
              {formatHookStyle(hookStyle)}
            </span>
            <button
              type="button"
              onClick={startEdit}
              className="flex-shrink-0 text-[11px] text-[#9CA3AF] opacity-0 transition-opacity hover:text-[#2563EB] group-hover:opacity-100"
            >
              Edit
            </button>
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
    <button
      onClick={handleExport}
      disabled={loading}
      className="h-8 flex-shrink-0 rounded-md border border-[#E5E7EB] bg-white px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB] disabled:opacity-50"
    >
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
    </button>
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
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[12px] font-medium text-green-800">
        Free trial
        {trialDays != null ? ` · ${trialDays} day${trialDays === 1 ? "" : "s"} remaining` : ""}
      </span>
    ) : status === "active" ? (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[12px] font-medium text-green-800">
        Active — $10/month
      </span>
    ) : status === "past_due" ? (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-medium text-amber-900">
        Payment failed
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-[12px] font-medium text-red-800">
        No active plan
      </span>
    );

  const cta =
    status === "past_due" ? (
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/portal", "portal")}
        className="flex h-8 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        {loading === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Update payment method
      </button>
    ) : status === "trialing" || status === "active" ? (
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/portal", "portal")}
        className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB] disabled:opacity-50"
      >
        {loading === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Manage subscription
      </button>
    ) : (
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => void postBilling("/api/billing/checkout", "checkout")}
        className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
      >
        {loading === "checkout" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Start free trial
      </button>
    );

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-medium text-[#111827]">Billing</h3>
            {pill}
          </div>
          {status === "past_due" ? (
            <p className="text-[13px] text-[#92400E]">Update your card to restore full access.</p>
          ) : status === "trialing" || status === "active" ? (
            <p className="text-[13px] text-[#6B7280]">
              {status === "trialing"
                ? "Your trial includes full generation and publishing. Cancel anytime from the portal."
                : "You're on the Voce monthly plan."}
            </p>
          ) : (
            <p className="text-[13px] text-[#6B7280]">
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
        <p className="text-[13px] font-medium text-[#DC2626]">Are you sure? This cannot be undone.</p>
        <button
          onClick={() => setConfirming(false)}
          className="h-8 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#374151] transition-colors hover:bg-[#F9FAFB]"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="h-8 rounded-md bg-[#DC2626] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
        >
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
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="h-8 rounded-md border border-[#FECACA] px-3 text-[12px] font-medium text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
    >
      Delete account
    </button>
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
    <div className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-[#FAFAFA]">
      <span className="w-36 flex-shrink-0 pt-0.5 text-[12px] font-medium text-[#9CA3AF]">{label}</span>
      <div className="min-w-0 flex-1">
        {editing && editable && onEdit ? (
          <div className="space-y-1.5">
            {selectOptions?.length ? (
              <select
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-md border border-[#2563EB] bg-white px-2 py-1.5 text-[13px] text-[#374151] outline-none"
                autoFocus
              >
                {selectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : multiline ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-[#2563EB] px-2 py-1.5 text-[13px] text-[#374151] outline-none"
                autoFocus
              />
            ) : (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-md border border-[#2563EB] px-2 py-1 text-[13px] text-[#374151] outline-none"
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onEdit(editValue);
                  setEditing(false);
                }}
                className="text-[11px] font-medium text-[#2563EB]"
              >
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-[#9CA3AF]">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {typeof value === "string" ? (
              <span className="text-[13px] leading-relaxed text-[#374151]">
                {value || <span className="text-[#9CA3AF]">Not detected</span>}
              </span>
            ) : (
              value
            )}
            {editable && onEdit ? (
              <button
                type="button"
                onClick={() => {
                  if (selectOptions?.length) {
                    setEditValue(selectValue ?? selectOptions[0]?.value ?? "");
                  } else {
                    setEditValue(typeof value === "string" ? value : "");
                  }
                  setEditing(true);
                }}
                className="flex-shrink-0 text-[11px] text-[#9CA3AF] opacity-0 transition-opacity hover:text-[#2563EB] group-hover:opacity-100"
              >
                Edit
              </button>
            ) : null}
          </div>
        )}
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
  const [emojiNeverOverride, setEmojiNeverOverride] = useState(false);
  const [newSignaturePhrase, setNewSignaturePhrase] = useState("");
  const [newNeverPattern, setNewNeverPattern] = useState("");
  const [userBannedWordsText, setUserBannedWordsText] = useState("");
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
    setUserBannedWordsText(((vp.userBannedWords as string[]) ?? []).join(", "));
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
    const userBannedWords = userBannedWordsText
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

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
      ? { label: "FULL ✓", className: "bg-green-100 text-green-700", nudge: "Voice fully calibrated. Add posts anytime to keep it current." }
      : calibrationQuality === "mostly"
        ? { label: "MOSTLY ◐", className: "bg-amber-100 text-amber-700", nudge: "Almost there - add 1-2 more posts to reach full calibration." }
        : calibrationQuality === "partial"
          ? { label: "PARTIAL ◑", className: "bg-amber-100 text-amber-700", nudge: "Add more posts for better accuracy. 8+ posts recommended." }
          : { label: "UNCALIBRATED ○", className: "bg-red-100 text-red-700", nudge: "Add at least 3 posts to start calibrating your voice." };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#111827]">Settings</h1>
        <p className="mt-0.5 text-[13px] text-[#6B7280]">Manage voice, topics, scheduling, and LinkedIn connection</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="sticky top-6 hidden self-start lg:block">
          <div className="space-y-1 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
            {[
              { id: "voice", label: "Voice Profile" },
              { id: "topics", label: "Topics" },
              { id: "scheduling", label: "Scheduling" },
              { id: "linkedin", label: "LinkedIn" },
              { id: "billing", label: "Billing" },
              { id: "account", label: "Account" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  activeSection === item.id
                    ? "bg-[#EFF6FF] font-medium text-[#2563EB]"
                    : "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          <section id="voice" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Voice Profile</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">How your posts should sound</p>
            </div>

            <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <div className="flex items-center justify-between rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      calibrationQuality === "full" && "bg-[#16A34A]",
                      (calibrationQuality === "mostly" || calibrationQuality === "partial") && "bg-[#D97706]",
                      calibrationQuality === "uncalibrated" && "bg-[#DC2626]",
                    )}
                  />
                  <span className="text-[13px] font-medium text-[#111827]">Voice {calibrationUi.label}</span>
                  <span className="text-[12px] text-[#6B7280]">
                    {sampleCount} sample post{sampleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="hidden text-[12px] text-[#6B7280] md:block">{calibrationUi.nudge}</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[13px] font-medium text-[#374151]">Sample posts</label>
                  <p className="text-[12px] text-[#9CA3AF]">
                    Add your best LinkedIn posts. The more you add, the more accurate your voice profile.
                  </p>
                </div>
                <div className="space-y-3">
                  {samplePosts.map((post, index) => (
                    <div key={index} className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2">
                        <span className="text-[12px] font-medium text-[#6B7280]">Post {index + 1}</span>
                        {samplePosts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePost(index)}
                            className="text-[#9CA3AF] transition-colors hover:text-[#DC2626]"
                            aria-label={`Remove post ${index + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <textarea
                        value={post}
                        onChange={(e) => updatePost(index, e.target.value)}
                        placeholder="Paste your LinkedIn post here..."
                        rows={4}
                        maxLength={3000}
                        className="w-full resize-none border-0 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#374151] outline-none placeholder:text-[#9CA3AF]"
                      />
                      {post.length > 0 && post.length < 100 ? (
                        <p className="text-[11px] text-[#D97706] px-3 pb-2">
                          Post is too short — add more content for better voice extraction
                        </p>
                      ) : null}
                      <div className="flex items-center justify-between border-t border-[#F3F4F6] bg-[#FAFAFA] px-3 py-1.5">
                        <span className="text-[11px] text-[#9CA3AF]">
                          Plain text only · LinkedIn posts work best
                        </span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            post.length > 3000
                              ? "text-[#DC2626]"
                              : post.length < 100
                                ? "text-[#9CA3AF]"
                                : "text-[#16A34A]",
                          )}
                        >
                          {post.length} / 3000
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addPost}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <Plus className="h-4 w-4" />
                  Add another post
                </button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          validPostCount >= 8 ? "bg-[#16A34A]" : validPostCount >= 3 ? "bg-[#D97706]" : "bg-[#E5E7EB]",
                        )}
                        style={{ width: `${Math.min((validPostCount / 8) * 100, 100)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "font-medium",
                        validPostCount >= 8 ? "text-[#16A34A]" : validPostCount >= 3 ? "text-[#D97706]" : "text-[#9CA3AF]",
                      )}
                    >
                      {validPostCount} / 8 posts
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6B7280]">Calibration: {validPostCount} of 8 recommended posts added</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Raw description</label>
                  <p className="text-[12px] text-[#9CA3AF]">Short plain-English description of your writing style</p>
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={rawDescription}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.rawDescription = true;
                      setRawDescription(e.target.value);
                    }}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Tone markers</label>
                  <p className="text-[12px] text-[#9CA3AF]">Comma-separated tone keywords</p>
                  <input
                    value={toneMarkers.join(", ")}
                    onChange={(e) =>
                      setToneMarkers(
                        e.target.value
                          .split(",")
                          .map((m) => m.trim())
                          .filter(Boolean),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">Banned words</label>
                  <p className="text-[12px] text-[#9CA3AF]">Comma-separated words/phrases to avoid</p>
                  <input
                    value={userBannedWordsText}
                    onChange={(e) => setUserBannedWordsText(e.target.value)}
                    className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-[#374151]">User notes</label>
                  <p className="text-[12px] text-[#9CA3AF]">Additional instructions for style constraints</p>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={userNotes}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.userNotes = true;
                      setUserNotes(e.target.value);
                    }}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-medium text-[#374151]">Personal context</label>
                  <p className="text-[12px] text-[#9CA3AF]">Used by the personal-angle draft enhancement</p>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={personalContext}
                    onChange={(e) => {
                      touchedVoiceTextFields.current.personalContext = true;
                      setPersonalContext(e.target.value);
                    }}
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              {calibrationQuality !== "uncalibrated" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-[#374151]">What we learned about your voice</h3>
                    <span className="text-[11px] text-[#9CA3AF]">Edit anything that looks wrong</span>
                  </div>

                  <div className="divide-y divide-[#F3F4F6] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
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
                          <div className="flex flex-wrap gap-1">
                            {neverPatterns.map((pattern, i) => (
                              <button
                                key={`never-${i}-${pattern.slice(0, 12)}`}
                                type="button"
                                title="Remove"
                                onClick={() => removeNeverPattern(i)}
                                className="rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 text-[11px] text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
                              >
                                {pattern} ×
                              </button>
                            ))}
                          </div>
                        }
                      />
                    ) : null}
                    {signaturePhrases.length > 0 ? (
                      <VoiceRow
                        label="Your signature phrases"
                        value={
                          <div className="flex flex-wrap gap-1">
                            {signaturePhrases.map((phrase, i) => (
                              <button
                                key={`sig-${i}-${phrase.slice(0, 12)}`}
                                type="button"
                                title="Click to remove"
                                onClick={() => removeSignaturePhrase(i)}
                                className="cursor-pointer rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] text-[#2563EB] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                              >
                                {phrase} ×
                              </button>
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
                      <p className="mb-1.5 text-[12px] font-medium text-[#6B7280]">Add signature phrase</p>
                      <div className="flex gap-2">
                        <input
                          value={newSignaturePhrase}
                          onChange={(e) => setNewSignaturePhrase(e.target.value)}
                          className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const phrase = newSignaturePhrase.trim();
                            if (!phrase) return;
                            const next = [...signaturePhrases, phrase];
                            setSignaturePhrases(next);
                            setNewSignaturePhrase("");
                            await patchVoiceOverrides({ signaturePhrases: next });
                          }}
                          className="h-8 flex-shrink-0 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#374151] hover:bg-[#F3F4F6]"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-[#6B7280]">Add never pattern</p>
                      <div className="flex gap-2">
                        <input
                          value={newNeverPattern}
                          onChange={(e) => setNewNeverPattern(e.target.value)}
                          className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const pattern = newNeverPattern.trim();
                            if (!pattern) return;
                            const next = [...neverPatterns, pattern];
                            setNeverPatterns(next);
                            setNewNeverPattern("");
                            await patchVoiceOverrides({ neverPatterns: next });
                          }}
                          className="h-8 flex-shrink-0 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#374151] hover:bg-[#F3F4F6]"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleReanalyze()}
                    disabled={isExtracting || validPostCount < 3}
                    className="flex items-center gap-1.5 text-[12px] text-[#6B7280] transition-colors hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
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
                  </button>
                </div>
              ) : null}

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[13px] font-medium text-[#374151]">Never use emojis</p>
                  <p className="text-[12px] text-[#9CA3AF]">Override all emoji generation</p>
                </div>
                <input
                  type="checkbox"
                  checked={emojiNeverOverride}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setEmojiNeverOverride(next);
                    await patchVoiceOverrides({ emojiNeverOverride: next });
                  }}
                />
              </div>

              <div className="border-t border-[#E5E7EB] pt-4">
                <p className="mb-3 text-[12px] text-[#6B7280]">Content style scanner preferences</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[
                      { value: "always", label: "Always flag" },
                      { value: "three_plus", label: "Flag if >3 items" },
                      { value: "never", label: "Never flag" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTellFlagNumberedLists(opt.value as "always" | "three_plus" | "never")}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-[12px] transition-colors",
                          tellFlagNumberedLists === opt.value
                            ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                            : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {[
                    { key: "tellFlagBannedWords", label: "Banned words" },
                    { key: "tellFlagEmDash", label: "Em dash overuse" },
                    { key: "tellFlagEngagementBeg", label: "Engagement begs" },
                    { key: "tellFlagEveryLine", label: "Every-line-break format" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between border-b border-[#E5E7EB] py-2 last:border-0">
                      <p className="text-[13px] text-[#374151]">{item.label}</p>
                      <button
                        onClick={() => toggleTellFlag(item.key as keyof typeof tellFlags)}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          tellFlags[item.key as keyof typeof tellFlags] ? "bg-[#2563EB]" : "bg-[#E5E7EB]",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                            tellFlags[item.key as keyof typeof tellFlags] ? "translate-x-4" : "translate-x-1",
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={saveOverrides}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
              >
                Save Voice Overrides
              </button>
              <button
                onClick={handleSaveTellSettings}
                disabled={savingTellSettings}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] disabled:opacity-50"
              >
                Save Style Preferences
              </button>
              <button
                onClick={saveVoice}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Save Voice Profile
              </button>
            </div>
          </section>

          <section id="topics" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Topics</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">What you want to post about</p>
            </div>
            <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              {topics.map((topic, i) => (
                <div
                  key={topic.id ?? i}
                  className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4 transition-colors hover:border-[#D1D5DB]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                      <span className="text-[13.5px] font-medium text-[#111827]">{topic.topicLabel || "Untitled topic"}</span>
                    </div>
                    {topics.length > 1 ? (
                      <button
                        onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))}
                        className="text-[#9CA3AF] transition-colors hover:text-[#DC2626]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Topic label</label>
                      <input
                        type="text"
                        value={topic.topicLabel}
                        onChange={(e) => updateTopic(i, "topicLabel", e.target.value)}
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Search query</label>
                        {topic.topicLabel.trim() &&
                        (!topic.tavilyQuery.trim() || topic.topicLabel.trim() !== (topic.lastSavedTopicLabel ?? "").trim()) ? (
                          <button
                            type="button"
                            onClick={() => suggestTopicQuery(i)}
                            disabled={suggestingTopicIndex === i}
                            className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline disabled:opacity-50"
                          >
                            {suggestingTopicIndex === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Suggest
                          </button>
                        ) : null}
                      </div>
                      <input
                        type="text"
                        value={topic.tavilyQuery}
                        onChange={(e) => {
                          updateTopic(i, "tavilyQuery", e.target.value);
                          updateTopic(i, "querySuggested", false);
                        }}
                        className={cn(
                          "h-8 w-full rounded-md border px-3 text-[13px]",
                          topic.querySuggested ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#E5E7EB] bg-white",
                        )}
                      />
                      {topic.querySuggested ? <p className="text-[11px] text-[#D97706]">AI suggested - edit if needed</p> : null}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[12px] font-medium uppercase tracking-wide text-[#6B7280]">Source URLs</label>
                      <input
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
                        className="h-8 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                      />
                      <p className="text-[11px] text-[#9CA3AF]">RSS feeds or blogs, comma separated</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[#6B7280]">Priority</span>
                      <div className="flex gap-1">
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
                            className={cn(
                              "h-7 w-7 rounded-md border text-[12px] transition-colors",
                              (topic.priorityWeight ?? 3) === weight
                                ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                                : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6]",
                            )}
                          >
                            {weight}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => saveTopicRow(i)}
                      className="h-7 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setTopics((prev) => [
                    ...prev,
                    { topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3, lastSavedTopicLabel: "", querySuggested: false },
                  ])
                }
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <Plus className="h-4 w-4" />
                Add topic
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveTopics}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Save Topics
              </button>
            </div>
          </section>

          <section id="scheduling" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Scheduling</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">When approved posts are published</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <SchedulingForm initialSettings={schedulingSettings} />
            </div>
          </section>

          <section id="linkedin" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">LinkedIn</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">Connection status for publishing</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              {!linkedinToken ? (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn not connected</p>
                      <p className="text-[12px] text-[#6B7280]">Connect to enable publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md bg-[#DC2626] px-3 text-[12px] font-medium leading-8 text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    Connect
                  </a>
                </div>
              ) : linkedinToken.status === "active" ? (
                <div className="flex items-center justify-between rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0077B5]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn connected</p>
                      <p className="text-[12px] text-[#6B7280]">
                        Token expires {formatDistanceToNow(new Date(linkedinToken.tokenExpiry), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md border border-[#E5E7EB] bg-white px-3 text-[12px] leading-8 text-[#374151] transition-colors hover:bg-[#F3F4F6]"
                  >
                    Reconnect
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626]">
                      <span className="text-[12px] font-semibold text-white">in</span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium text-[#111827]">LinkedIn token expired</p>
                      <p className="text-[12px] text-[#6B7280]">Reconnect to resume publishing</p>
                    </div>
                  </div>
                  <a
                    href="/api/auth/linkedin"
                    className="h-8 rounded-md bg-[#DC2626] px-3 text-[12px] font-medium leading-8 text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    Reconnect now
                  </a>
                </div>
              )}
            </div>
          </section>

          <section id="billing" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Billing</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">Subscription and payments</p>
            </div>
            <BillingCard subscription={subscription} />
          </section>

          <section id="account" className="scroll-mt-6 space-y-4">
            <div className="border-b border-[#E5E7EB] pb-3">
              <h2 className="text-[16px] font-semibold text-[#111827]">Account</h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">Manage your data and account</p>
            </div>

            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[14px] font-medium text-[#111827]">Export your data</h3>
                  <p className="mt-0.5 text-[13px] text-[#6B7280]">
                    Download all your drafts, posts, voice profile, topics, and activity as a JSON file.
                  </p>
                </div>
                <ExportButton />
              </div>
            </div>

            <div className="rounded-lg border border-[#FECACA] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
              <h3 className="mb-1 text-[14px] font-medium text-[#DC2626]">Danger zone</h3>
              <p className="mb-4 text-[13px] text-[#6B7280]">
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
