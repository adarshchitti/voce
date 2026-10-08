"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Voiceprint, voiceprintFromScan, type VoiceprintScores } from "@/components/Voiceprint";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STEPS = ["Voice", "Topics", "LinkedIn", "Scheduling", "First draft"];
const DAYS = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "UTC", label: "UTC" },
];

type TopicRow = {
  id?: string;
  topicLabel: string;
  tavilyQuery: string;
  sourceUrls: string[];
  priorityWeight: number;
  querySuggested?: boolean;
};

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

function normalizeTime(time: string) {
  return time?.slice(0, 5) ?? "09:00";
}

function OnboardingSuggestionsPanel({
  state,
  onToggle,
  onApply,
  onDismiss,
}: {
  state: SourceSuggestionState;
  onToggle: (url: string) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="mt-2 rounded-[10px] border-2 border-dashed border-ink bg-paper-sunk p-3 text-[12px] text-ink-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Looking up sources...
        </div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mt-2 rounded-[10px] border-2 border-ink bg-p-coral p-3 text-[12px] text-ink">
        <div className="flex items-start justify-between gap-3">
          <span>{state.message}</span>
          <button onClick={onDismiss} className="text-ink hover:opacity-70">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }
  const selectedCount = state.candidates.filter((c) => state.selected[c.url]).length;
  return (
    <div className="mt-2 space-y-2 rounded-[10px] border-2 border-dashed border-ink bg-paper-sunk p-3">
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
          <label key={c.url} className="flex items-start gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={Boolean(state.selected[c.url])}
              onChange={() => onToggle(c.url)}
              className="mt-0.5 accent-ink"
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

function OnboardingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const currentStep = Math.min(Math.max(Number.parseInt(stepParam ?? "1", 10) - 1, 0), STEPS.length - 1);

  const [samplePosts, setSamplePosts] = useState<string[]>([""]);
  const [calibrationQuality, setCalibrationQuality] = useState<string>("uncalibrated");
  const [topics, setTopics] = useState<TopicRow[]>([{ topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3 }]);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [schedule, setSchedule] = useState({
    preferredTime: "09:00",
    timezone: "UTC",
    preferredDays: ["monday", "tuesday", "wednesday", "thursday"],
    draftsPerDay: 3,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestingTopic, setSuggestingTopic] = useState<number | null>(null);
  const [sourceSuggestions, setSourceSuggestions] = useState<Record<string, SourceSuggestionState>>({});
  const [awaitingSourceSuggestions, setAwaitingSourceSuggestions] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Analysing your writing style...");
  const [draftStatus, setDraftStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [draftPreview, setDraftPreview] = useState("");
  const [draftScores, setDraftScores] = useState<VoiceprintScores | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const validPostCount = useMemo(() => samplePosts.filter((post) => post.trim().length >= 100).length, [samplePosts]);

  function goToStep(step: number) {
    router.push(`/onboarding?step=${step + 1}`);
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
    const res = await fetch(`/api/topics?id=${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrls: merged }),
    });
    if (!res.ok) {
      setError("Could not add sources. Please try again.");
      return;
    }
    setTopics((prev) => prev.map((row, i) => (i === topicIndex ? { ...row, sourceUrls: merged } : row)));
    dismissSourceSuggestions(topicId);
  }

  async function markOnboardingComplete() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => null);
  }

  useEffect(() => {
    Promise.all([fetch("/api/voice"), fetch("/api/topics"), fetch("/api/settings")])
      .then(async ([voiceRes, topicsRes, settingsRes]) => {
        if (voiceRes.ok) {
          const voiceData = (await voiceRes.json()) as { voiceProfile?: { samplePosts?: string[]; calibrationQuality?: string } | null };
          const loadedPosts = voiceData.voiceProfile?.samplePosts?.filter(Boolean) ?? [];
          setSamplePosts(loadedPosts.length ? loadedPosts : [""]);
          setCalibrationQuality(voiceData.voiceProfile?.calibrationQuality ?? "uncalibrated");
        }
        if (topicsRes.ok) {
          const topicsData = (await topicsRes.json()) as { topics?: TopicRow[] };
          const loadedTopics = topicsData.topics ?? [];
          setTopics(
            loadedTopics.length
              ? loadedTopics.map((topic) => ({ ...topic, querySuggested: false, sourceUrls: topic.sourceUrls ?? [] }))
              : [{ topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3 }],
          );
        }
        if (settingsRes.ok) {
          const settingsData = (await settingsRes.json()) as {
            settings?: { preferredTime?: string; timezone?: string; preferredDays?: string[]; draftsPerDay?: number };
            linkedinToken?: { status?: string } | null;
          };
          setLinkedinConnected(settingsData.linkedinToken?.status === "active");
          setSchedule({
            preferredTime: normalizeTime(settingsData.settings?.preferredTime ?? "09:00"),
            timezone: settingsData.settings?.timezone ?? "UTC",
            preferredDays: settingsData.settings?.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"],
            draftsPerDay: settingsData.settings?.draftsPerDay ?? 3,
          });
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (currentStep !== 4 || draftStatus !== "idle") return;
    setDraftStatus("loading");
    void markOnboardingComplete();

    const t1 = window.setTimeout(() => setLoadingMessage("Writing in your voice..."), 3000);
    const t2 = window.setTimeout(() => setLoadingMessage("Reviewing for quality..."), 6000);

    fetch("/api/drafts/generate-one", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error("generation_failed");
        const data = (await res.json()) as { draftId?: string };
        if (!data.draftId) throw new Error("missing_draft");
        const draftsRes = await fetch("/api/drafts?status=pending");
        const draftsData = (await draftsRes.json()) as { drafts?: Array<{ id: string; draftText: string; aiTellFlags?: unknown }> };
        const draft = (draftsData.drafts ?? []).find((d) => d.id === data.draftId);
        setDraftPreview((draft?.draftText ?? "").slice(0, 200));
        setDraftScores(draft ? voiceprintFromScan(draft.aiTellFlags) : null);
        setDraftStatus("success");
      })
      .catch(() => setDraftStatus("error"))
      .finally(() => {
        clearTimeout(t1);
        clearTimeout(t2);
      });
  }, [currentStep, draftStatus]);

  async function handleContinue() {
    setError(null);
    if (currentStep === 0) {
      const nonEmptyPosts = samplePosts.map((post) => post.trim()).filter(Boolean);
      if (nonEmptyPosts.filter((post) => post.length >= 100).length === 0) {
        setError("Add at least one post to continue. You can improve accuracy by adding more later.");
        return;
      }
      setLoading(true);
      setLoadingMessage("Analysing your writing style...");
      try {
        const response = await fetch("/api/voice", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ samplePosts: nonEmptyPosts }),
        });
        if (!response.ok) throw new Error("voice_save_failed");
        goToStep(1);
      } catch {
        setError("Could not analyse your posts. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (currentStep === 1) {
      // Second click after suggestions are visible — just advance.
      if (awaitingSourceSuggestions) {
        goToStep(2);
        return;
      }

      const validIndices = topics
        .map((topic, index) => ({ topic, index }))
        .filter((entry) => entry.topic.topicLabel.trim() && entry.topic.tavilyQuery.trim());
      if (validIndices.length === 0) {
        setError("Add at least one topic to continue.");
        return;
      }
      setLoading(true);
      try {
        const savedTopics: Array<{ index: number; id: string; sourceUrls: string[] }> = [];
        for (const entry of validIndices) {
          const topic = entry.topic;
          if (topic.id) {
            await fetch(`/api/topics?id=${encodeURIComponent(topic.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topicLabel: topic.topicLabel.trim(),
                tavilyQuery: topic.tavilyQuery.trim(),
                sourceUrls: topic.sourceUrls,
                priorityWeight: topic.priorityWeight,
              }),
            });
            savedTopics.push({ index: entry.index, id: topic.id, sourceUrls: topic.sourceUrls });
          } else {
            const res = await fetch("/api/topics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topicLabel: topic.topicLabel.trim(),
                tavilyQuery: topic.tavilyQuery.trim(),
                sourceUrls: topic.sourceUrls,
                priorityWeight: topic.priorityWeight,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { topic?: { id?: string } };
            const newId = data.topic?.id;
            if (newId) {
              savedTopics.push({ index: entry.index, id: newId, sourceUrls: topic.sourceUrls });
              setTopics((prev) => prev.map((row, i) => (i === entry.index ? { ...row, id: newId } : row)));
            }
          }
        }

        if (!AUTO_SUGGEST_SOURCES_ENABLED) {
          goToStep(2);
          return;
        }

        const eligible = savedTopics.filter((t) => t.sourceUrls.length === 0);
        if (eligible.length === 0) {
          goToStep(2);
          return;
        }

        // Mark each eligible topic as loading and fire suggestions in parallel.
        setSourceSuggestions((prev) => {
          const next = { ...prev };
          for (const t of eligible) next[t.id] = { kind: "loading" };
          return next;
        });
        const fetched = await Promise.all(
          eligible.map(async (t) => {
            try {
              const res = await fetch(`/api/topics/${encodeURIComponent(t.id)}/suggest-sources`, {
                method: "POST",
              });
              if (!res.ok) return { id: t.id, ok: false as const };
              const data = (await res.json()) as {
                candidates?: SuggestedSourceCandidate[];
                stats?: { requested: number; validated: number };
              };
              return { id: t.id, ok: true as const, candidates: data.candidates ?? [], stats: data.stats };
            } catch {
              return { id: t.id, ok: false as const };
            }
          }),
        );

        let anyResults = false;
        setSourceSuggestions((prev) => {
          const next = { ...prev };
          for (const f of fetched) {
            if (!f.ok) {
              delete next[f.id];
              continue;
            }
            if (f.candidates.length === 0) {
              delete next[f.id];
              continue;
            }
            const selected: Record<string, boolean> = {};
            for (const c of f.candidates) selected[c.url] = true;
            next[f.id] = { kind: "results", candidates: f.candidates, selected, stats: f.stats };
            anyResults = true;
          }
          return next;
        });

        if (anyResults) {
          setAwaitingSourceSuggestions(true);
        } else {
          goToStep(2);
        }
      } catch {
        setError("Could not save topics. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (currentStep === 2) {
      goToStep(3);
      return;
    }

    if (currentStep === 3) {
      setLoading(true);
      try {
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferredTime: normalizeTime(schedule.preferredTime),
            timezone: schedule.timezone,
            preferredDays: schedule.preferredDays,
            draftsPerDay: schedule.draftsPerDay,
          }),
        });
        goToStep(4);
      } catch {
        setError("Could not save scheduling preferences.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-paper px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border-2 border-ink bg-p-blue font-display text-[17px] font-extrabold text-ink">
              V
            </div>
            <span className="font-display text-[18px] font-bold text-ink">Voce</span>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              await markOnboardingComplete();
              router.push("/inbox");
            }}
            className="link-rule text-[13px] font-medium text-ink"
          >
            Skip setup - go to inbox →
          </button>
        </div>

        {/* Numbered step markers */}
        <p className="eyebrow mb-4 text-ink-3">
          Step {currentStep + 1} of {STEPS.length}
        </p>
        <ol className="mb-8 flex items-start" aria-label="Setup progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === currentStep ? "step" : undefined}
              className="relative flex flex-1 flex-col items-center gap-2"
            >
              {i < STEPS.length - 1 ? (
                <div
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-4 h-0 w-full -translate-y-px border-t-2",
                    i < currentStep ? "border-solid border-ink" : "border-dashed border-ink/30",
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-ink font-display text-[13px] font-bold text-ink",
                  i <= currentStep ? "bg-p-blue" : "bg-surface text-ink-3",
                  i === currentStep && "shadow-xs",
                )}
              >
                {i < currentStep ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </div>
              <span className={cn("eyebrow hidden text-[11px] sm:block", i === currentStep ? "text-ink" : "text-ink-3")}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        <div className="rounded-[10px] border-2 border-ink bg-surface p-6 shadow-card sm:p-8">
          <div className="min-h-[380px]">
            {currentStep === 0 ? (
              <div className="space-y-4">
                <h1 className="display-3 text-ink">Set up your voice</h1>
                <p className="text-[14px] text-ink-2">
                  Paste 8+ of your best LinkedIn posts. We&apos;ll analyse them to learn how you write - so every draft sounds like you.
                </p>
                {samplePosts.map((post, index) => (
                  <div key={index} className="overflow-hidden rounded-[10px] border-2 border-ink bg-surface">
                    <div className="flex items-center justify-between border-b-2 border-ink bg-paper-sunk px-3 py-2">
                      <span className="eyebrow text-ink-2">Post {index + 1}</span>
                      {samplePosts.length > 1 ? (
                        <button
                          aria-label={`Remove post ${index + 1}`}
                          onClick={() => setSamplePosts((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <X className="h-3.5 w-3.5 text-ink-3 hover:text-ink" />
                        </button>
                      ) : null}
                    </div>
                    <Textarea
                      value={post}
                      onChange={(e) => setSamplePosts((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))}
                      rows={4}
                      placeholder="Paste your LinkedIn post here..."
                      className="min-h-[104px] resize-none rounded-none border-0 px-3 py-2.5 text-[13px] focus-visible:ring-inset"
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  onClick={() => setSamplePosts((prev) => [...prev, ""])}
                  className="w-full border-2 border-dashed border-ink text-ink-2"
                >
                  <Plus className="h-4 w-4" />
                  Add another post
                </Button>
                <div className="h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-surface">
                  <div className={cn("h-full", validPostCount >= 8 ? "bg-p-sage" : "bg-p-amber")} style={{ width: `${Math.min((validPostCount / 8) * 100, 100)}%` }} />
                </div>
                <p className="text-[12px] text-ink-2">
                  Tip: More posts = better accuracy. You can always add more later in Settings. ({validPostCount} valid, calibration {calibrationQuality})
                </p>
                {validPostCount > 0 && validPostCount < 3 ? (
                  <p className="rounded-[10px] border-2 border-dashed border-ink bg-p-amber px-3 py-2 text-[12px] text-ink">
                    You can continue with 1+ post now, but 3+ improves extraction quality.
                  </p>
                ) : null}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-4">
                <h1 className="display-3 text-ink">What do you want to post about?</h1>
                <p className="text-[14px] text-ink-2">
                  Add 3-5 topics you care about. Each topic needs a search query so we can find relevant articles.
                </p>
                {topics.map((topic, index) => (
                  <div key={topic.id ?? index} className="space-y-2 rounded-[10px] border-2 border-ink bg-paper-sunk p-4">
                    <div className="flex items-center justify-between">
                      <span className="eyebrow text-ink">Topic {index + 1}</span>
                      {topics.length > 1 ? (
                        <button
                          aria-label={`Remove topic ${index + 1}`}
                          onClick={() => setTopics((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-ink-3 hover:text-ink" />
                        </button>
                      ) : null}
                    </div>
                    <Input
                      value={topic.topicLabel}
                      onChange={(e) => setTopics((prev) => prev.map((item, i) => (i === index ? { ...item, topicLabel: e.target.value } : item)))}
                      placeholder="e.g. AI agents"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        value={topic.tavilyQuery}
                        onChange={(e) =>
                          setTopics((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, tavilyQuery: e.target.value, querySuggested: false } : item)),
                          )
                        }
                        placeholder="site:linkedin.com ai agents trends"
                        className={cn(topic.querySuggested && "border-dashed bg-p-amber")}
                      />
                      <Button
                        variant="outline"
                        disabled={!topic.topicLabel.trim() || suggestingTopic === index}
                        onClick={async () => {
                          setSuggestingTopic(index);
                          try {
                            const response = await fetch("/api/topics/suggest-query", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ topicLabel: topic.topicLabel.trim() }),
                            });
                            const data = (await response.json()) as { suggestedQuery?: string };
                            if (!response.ok || !data.suggestedQuery) throw new Error("suggest_failed");
                            setTopics((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, tavilyQuery: data.suggestedQuery ?? item.tavilyQuery, querySuggested: true } : item,
                              ),
                            );
                          } catch {
                            setError("Could not suggest a query. Please enter one manually.");
                          } finally {
                            setSuggestingTopic(null);
                          }
                        }}
                      >
                        {suggestingTopic === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Suggest
                      </Button>
                    </div>
                    {topic.querySuggested ? <p className="text-[11px] text-ink-2">AI suggested - edit if needed</p> : null}
                    {topic.id && sourceSuggestions[topic.id] ? (
                      <OnboardingSuggestionsPanel
                        state={sourceSuggestions[topic.id]}
                        onToggle={(url) => toggleSourceCandidate(topic.id!, url)}
                        onApply={() => applySourceSuggestions(index)}
                        onDismiss={() => dismissSourceSuggestions(topic.id!)}
                      />
                    ) : null}
                  </div>
                ))}
                {awaitingSourceSuggestions ? (
                  <p className="text-[12px] text-ink-2">
                    Pick the sources you want to follow, or click Continue to skip.
                  </p>
                ) : null}
                {topics.length < 5 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setTopics((prev) => [...prev, { topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3 }])}
                    className="w-full border-2 border-dashed border-ink text-ink-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add topic
                  </Button>
                ) : null}
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-4 text-center">
                <h1 className="display-3 text-ink">Connect LinkedIn</h1>
                <p className="text-[14px] text-ink-2">
                  Connect your LinkedIn account so Voce can publish posts on your behalf. We only post when you explicitly approve.
                </p>
                {linkedinConnected ? (
                  <div className="rounded-[10px] border-2 border-ink bg-p-sage p-4 text-[13px] font-medium text-ink">✓ LinkedIn connected. You&apos;re all set. Click Continue.</div>
                ) : (
                  <div className="space-y-3">
                    <a
                      href="/api/auth/linkedin?next=%2Fonboarding%3Fstep%3D4"
                      className={buttonVariants({ size: "lg" })}
                    >
                      Connect LinkedIn
                    </a>
                    <p className="eyebrow text-ink-3">- or -</p>
                    <button
                      onClick={() => goToStep(3)}
                      className="link-rule text-[13px] font-medium text-ink-2 hover:text-ink"
                    >
                      Skip for now →
                    </button>
                    <p className="text-[12px] text-ink-2">
                      You can connect LinkedIn later in Settings. You won&apos;t be able to publish until it&apos;s connected.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-4">
                <h1 className="display-3 text-ink">When should we post?</h1>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-timezone" className="eyebrow text-[12px] text-ink">Timezone</Label>
                    <select
                      id="ob-timezone"
                      value={schedule.timezone}
                      onChange={(e) => setSchedule((prev) => ({ ...prev, timezone: e.target.value }))}
                      className="h-9 w-full rounded-[10px] border-2 border-ink bg-surface px-3 text-[14px] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-solid"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-time" className="eyebrow text-[12px] text-ink">Preferred time</Label>
                    <Input
                      id="ob-time"
                      type="time"
                      value={schedule.preferredTime}
                      onChange={(e) => setSchedule((prev) => ({ ...prev, preferredTime: normalizeTime(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="eyebrow text-[12px] text-ink">Posting days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        aria-pressed={schedule.preferredDays.includes(day.value)}
                        onClick={() =>
                          setSchedule((prev) => ({
                            ...prev,
                            preferredDays: prev.preferredDays.includes(day.value)
                              ? prev.preferredDays.filter((value) => value !== day.value)
                              : [...prev.preferredDays, day.value],
                          }))
                        }
                        className={cn(
                          "h-8 cursor-pointer rounded-full border-2 border-ink px-3 text-[12px] font-medium transition-colors",
                          schedule.preferredDays.includes(day.value)
                            ? "bg-p-blue text-ink"
                            : "bg-surface text-ink-2 hover:bg-paper-sunk",
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-drafts" className="eyebrow text-[12px] text-ink">Drafts per day</Label>
                  <Input
                    id="ob-drafts"
                    type="number"
                    min={1}
                    max={5}
                    value={schedule.draftsPerDay}
                    onChange={(e) => setSchedule((prev) => ({ ...prev, draftsPerDay: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))}
                    className="w-24"
                  />
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-5 text-center">
                {draftStatus === "loading" ? (
                  <>
                    <h1 className="display-3 text-ink">Generating your first draft...</h1>
                    <div className="flex justify-center">
                      <Loader2 className="h-7 w-7 animate-spin text-accent-solid" />
                    </div>
                    <p className="text-[14px] text-ink-2 transition-opacity">{loadingMessage}</p>
                  </>
                ) : null}
                {draftStatus === "success" ? (
                  <>
                    <h1 className="display-3 text-ink">✓ Your first draft is ready</h1>
                    <div className="flex justify-center rounded-[10px] border-2 border-ink bg-p-amber py-8">
                      <Voiceprint
                        {...(draftScores ?? { specificity: 0.5, cadence: 0.5, humanness: 0.5, grounding: 0.5 })}
                        size={240}
                        showLegend
                      />
                    </div>
                    <div className="rounded-[10px] border-2 border-ink bg-paper-sunk p-4 text-left text-[13px] text-ink-2">
                      {draftPreview ? `"${draftPreview}${draftPreview.length >= 200 ? "..." : ""}"` : "Your new draft is waiting in Inbox."}
                    </div>
                  </>
                ) : null}
                {draftStatus === "error" ? (
                  <>
                    <h1 className="display-3 text-ink">We couldn&apos;t generate a draft right now.</h1>
                    <p className="text-[14px] text-ink-2">
                      This usually means we need a bit more time to find relevant articles. Check back tomorrow morning - your inbox will have fresh drafts.
                    </p>
                  </>
                ) : null}
                {draftStatus !== "idle" ? (
                  <div className="space-y-3">
                    <Button
                      size="lg"
                      onClick={async () => {
                        setCheckoutLoading(true);
                        try {
                          const res = await fetch("/api/billing/checkout", { method: "POST" });
                          const data = (await res.json()) as { url?: string; error?: string };
                          if (data.url) {
                            window.location.href = data.url;
                          } else {
                            router.push("/inbox");
                          }
                        } catch {
                          router.push("/inbox");
                        } finally {
                          setCheckoutLoading(false);
                        }
                      }}
                      disabled={checkoutLoading}
                    >
                      {checkoutLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {checkoutLoading ? "Loading..." : "Start your free trial →"}
                    </Button>
                    <p className="eyebrow text-ink-3">14 days free · $10/month after · Cancel anytime</p>
                    <div>
                      <button
                        onClick={() => router.push("/inbox")}
                        className="link-rule text-[12px] text-ink-3 hover:text-ink"
                      >
                        Skip for now, go to inbox
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="mb-3 text-[13px] font-medium text-destructive">{error}</p> : null}

          {currentStep < 4 ? (
            <div className="flex items-center justify-between border-t border-hairline pt-5">
              <Button
                variant="outline"
                onClick={() => goToStep(Math.max(currentStep - 1, 0))}
                disabled={currentStep === 0 || loading}
              >
                Back
              </Button>
              <Button onClick={handleContinue} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading && currentStep === 0 ? loadingMessage : "Continue →"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <OnboardingPageInner />
    </Suspense>
  );
}
