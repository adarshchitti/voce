"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

function normalizeTime(time: string) {
  return time?.slice(0, 5) ?? "09:00";
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
  const [loadingMessage, setLoadingMessage] = useState("Analysing your writing style...");
  const [draftStatus, setDraftStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [draftPreview, setDraftPreview] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const validPostCount = useMemo(() => samplePosts.filter((post) => post.trim().length >= 100).length, [samplePosts]);
  const completionPct = ((currentStep + 1) / STEPS.length) * 100;

  function goToStep(step: number) {
    router.push(`/onboarding?step=${step + 1}`);
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
        const draftsData = (await draftsRes.json()) as { drafts?: Array<{ id: string; draftText: string }> };
        const draft = (draftsData.drafts ?? []).find((d) => d.id === data.draftId);
        setDraftPreview((draft?.draftText ?? "").slice(0, 200));
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
      const validTopics = topics.filter((topic) => topic.topicLabel.trim() && topic.tavilyQuery.trim());
      if (validTopics.length === 0) {
        setError("Add at least one topic to continue.");
        return;
      }
      setLoading(true);
      try {
        for (const topic of validTopics) {
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
          } else {
            await fetch("/api/topics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topicLabel: topic.topicLabel.trim(),
                tavilyQuery: topic.tavilyQuery.trim(),
                sourceUrls: topic.sourceUrls,
                priorityWeight: topic.priorityWeight,
              }),
            });
          }
        }
        goToStep(2);
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
    <div className="min-h-screen bg-[#F7F7F7] px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-[15px] font-bold text-white">V</div>
            <span className="text-[16px] font-semibold text-[#111827]">Voce</span>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              await markOnboardingComplete();
              router.push("/inbox");
            }}
            className="text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8]"
          >
            Skip setup - go to inbox →
          </button>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
          <p className="mb-2 text-[12px] text-[#6B7280]">Step {currentStep + 1} of {STEPS.length}</p>
          <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${completionPct}%` }} />
          </div>

          <div className="mb-6 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div key={i} className={cn("flex items-center gap-2", i < STEPS.length - 1 && "flex-1")}>
                <div
                  className={cn(
                    "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                    i < currentStep && "bg-[#2563EB] text-white",
                    i === currentStep && "bg-[#2563EB] text-white ring-2 ring-[#BFDBFE]",
                    i > currentStep && "bg-[#F3F4F6] text-[#9CA3AF]",
                  )}
                >
                  {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={cn("h-px flex-1", i < currentStep ? "bg-[#2563EB]" : "bg-[#E5E7EB]")} />}
              </div>
            ))}
          </div>

          <div className="min-h-[380px]">
            {currentStep === 0 ? (
              <div className="space-y-4">
                <h1 className="text-[22px] font-semibold text-[#111827]">Set up your voice</h1>
                <p className="text-[13.5px] text-[#6B7280]">
                  Paste 8+ of your best LinkedIn posts. We&apos;ll analyse them to learn how you write - so every draft sounds like you.
                </p>
                {samplePosts.map((post, index) => (
                  <div key={index} className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                    <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2">
                      <span className="text-[12px] font-medium text-[#6B7280]">Post {index + 1}</span>
                      {samplePosts.length > 1 ? (
                        <button onClick={() => setSamplePosts((prev) => prev.filter((_, i) => i !== index))}>
                          <X className="h-3.5 w-3.5 text-[#9CA3AF]" />
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      value={post}
                      onChange={(e) => setSamplePosts((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))}
                      rows={4}
                      placeholder="Paste your LinkedIn post here..."
                      className="w-full resize-none border-0 px-3 py-2.5 text-[13px] outline-none placeholder:text-[#9CA3AF]"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setSamplePosts((prev) => [...prev, ""])}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <Plus className="h-4 w-4" />
                  Add another post
                </button>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
                  <div className={cn("h-full rounded-full", validPostCount >= 8 ? "bg-[#16A34A]" : "bg-[#D97706]")} style={{ width: `${Math.min((validPostCount / 8) * 100, 100)}%` }} />
                </div>
                <p className="text-[12px] text-[#6B7280]">
                  Tip: More posts = better accuracy. You can always add more later in Settings. ({validPostCount} valid, calibration {calibrationQuality})
                </p>
                {validPostCount > 0 && validPostCount < 3 ? (
                  <p className="text-[12px] text-[#D97706]">You can continue with 1+ post now, but 3+ improves extraction quality.</p>
                ) : null}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-4">
                <h1 className="text-[22px] font-semibold text-[#111827]">What do you want to post about?</h1>
                <p className="text-[13.5px] text-[#6B7280]">
                  Add 3-5 topics you care about. Each topic needs a search query so we can find relevant articles.
                </p>
                {topics.map((topic, index) => (
                  <div key={topic.id ?? index} className="space-y-2 rounded-lg border border-[#E5E7EB] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[#111827]">Topic {index + 1}</span>
                      {topics.length > 1 ? (
                        <button onClick={() => setTopics((prev) => prev.filter((_, i) => i !== index))}>
                          <Trash2 className="h-3.5 w-3.5 text-[#9CA3AF]" />
                        </button>
                      ) : null}
                    </div>
                    <input
                      value={topic.topicLabel}
                      onChange={(e) => setTopics((prev) => prev.map((item, i) => (i === index ? { ...item, topicLabel: e.target.value } : item)))}
                      placeholder="e.g. AI agents"
                      className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        value={topic.tavilyQuery}
                        onChange={(e) =>
                          setTopics((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, tavilyQuery: e.target.value, querySuggested: false } : item)),
                          )
                        }
                        placeholder="site:linkedin.com ai agents trends"
                        className={cn(
                          "h-9 w-full rounded-md border px-3 text-[13px]",
                          topic.querySuggested ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#E5E7EB]",
                        )}
                      />
                      <button
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
                        className="flex h-9 items-center gap-1 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#2563EB] disabled:opacity-50"
                      >
                        {suggestingTopic === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Suggest
                      </button>
                    </div>
                    {topic.querySuggested ? <p className="text-[11px] text-[#D97706]">AI suggested - edit if needed</p> : null}
                  </div>
                ))}
                {topics.length < 5 ? (
                  <button
                    onClick={() => setTopics((prev) => [...prev, { topicLabel: "", tavilyQuery: "", sourceUrls: [], priorityWeight: 3 }])}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Plus className="h-4 w-4" />
                    Add topic
                  </button>
                ) : null}
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-4 text-center">
                <h1 className="text-[22px] font-semibold text-[#111827]">Connect LinkedIn</h1>
                <p className="text-[13.5px] text-[#6B7280]">
                  Connect your LinkedIn account so Voce can publish posts on your behalf. We only post when you explicitly approve.
                </p>
                {linkedinConnected ? (
                  <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-[13px] text-[#166534]">✓ LinkedIn connected. You&apos;re all set. Click Continue.</div>
                ) : (
                  <div className="space-y-3">
                    <a
                      href="/api/auth/linkedin?next=%2Fonboarding%3Fstep%3D4"
                      className="inline-flex h-9 items-center rounded-md bg-[#0077B5] px-4 text-[13px] font-medium text-white hover:bg-[#046293]"
                    >
                      Connect LinkedIn
                    </a>
                    <p className="text-[12px] text-[#9CA3AF]">- or -</p>
                    <button
                      onClick={() => goToStep(3)}
                      className="text-[12px] font-medium text-[#6B7280] underline underline-offset-2 hover:text-[#111827]"
                    >
                      Skip for now →
                    </button>
                    <p className="text-[12px] text-[#6B7280]">
                      You can connect LinkedIn later in Settings. You won&apos;t be able to publish until it&apos;s connected.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-4">
                <h1 className="text-[22px] font-semibold text-[#111827]">When should we post?</h1>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-[#374151]">Timezone</label>
                    <select
                      value={schedule.timezone}
                      onChange={(e) => setSchedule((prev) => ({ ...prev, timezone: e.target.value }))}
                      className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-[#374151]">Preferred time</label>
                    <input
                      type="time"
                      value={schedule.preferredTime}
                      onChange={(e) => setSchedule((prev) => ({ ...prev, preferredTime: normalizeTime(e.target.value) }))}
                      className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-[#374151]">Posting days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        onClick={() =>
                          setSchedule((prev) => ({
                            ...prev,
                            preferredDays: prev.preferredDays.includes(day.value)
                              ? prev.preferredDays.filter((value) => value !== day.value)
                              : [...prev.preferredDays, day.value],
                          }))
                        }
                        className={cn(
                          "h-8 rounded-full border px-3 text-[12px] font-medium",
                          schedule.preferredDays.includes(day.value)
                            ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                            : "border-[#E5E7EB] text-[#6B7280]",
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-[#374151]">Drafts per day</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={schedule.draftsPerDay}
                    onChange={(e) => setSchedule((prev) => ({ ...prev, draftsPerDay: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))}
                    className="h-9 w-24 rounded-md border border-[#E5E7EB] px-3 text-[13px]"
                  />
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-5 text-center">
                {draftStatus === "loading" ? (
                  <>
                    <h1 className="text-[22px] font-semibold text-[#111827]">Generating your first draft...</h1>
                    <div className="flex justify-center">
                      <Loader2 className="h-7 w-7 animate-spin text-[#2563EB]" />
                    </div>
                    <p className="text-[13.5px] text-[#6B7280] transition-opacity">{loadingMessage}</p>
                  </>
                ) : null}
                {draftStatus === "success" ? (
                  <>
                    <h1 className="text-[22px] font-semibold text-[#111827]">✓ Your first draft is ready</h1>
                    <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-4 text-left text-[13px] text-[#374151]">
                      {draftPreview ? `"${draftPreview}${draftPreview.length >= 200 ? "..." : ""}"` : "Your new draft is waiting in Inbox."}
                    </div>
                  </>
                ) : null}
                {draftStatus === "error" ? (
                  <>
                    <h1 className="text-[22px] font-semibold text-[#111827]">We couldn&apos;t generate a draft right now.</h1>
                    <p className="text-[13.5px] text-[#6B7280]">
                      This usually means we need a bit more time to find relevant articles. Check back tomorrow morning - your inbox will have fresh drafts.
                    </p>
                  </>
                ) : null}
                {draftStatus !== "idle" ? (
                  <div className="space-y-3">
                    <button
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
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#2563EB] px-5 text-[13px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                    >
                      {checkoutLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {checkoutLoading ? "Loading..." : "Start your free trial →"}
                    </button>
                    <p className="text-[12px] text-[#9CA3AF]">14 days free · $10/month after · Cancel anytime</p>
                    <button
                      onClick={() => router.push("/inbox")}
                      className="text-[12px] text-[#9CA3AF] underline underline-offset-2 hover:text-[#6B7280]"
                    >
                      Skip for now, go to inbox
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="mb-3 text-[12px] text-[#DC2626]">{error}</p> : null}

          {currentStep < 4 ? (
            <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-4">
              <button
                onClick={() => goToStep(Math.max(currentStep - 1, 0))}
                disabled={currentStep === 0 || loading}
                className="h-9 rounded-md border border-[#E5E7EB] px-4 text-[13px] font-medium text-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button onClick={handleContinue} disabled={loading} className="inline-flex h-9 items-center gap-1 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white disabled:opacity-50">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading && currentStep === 0 ? loadingMessage : "Continue →"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F7F7]" />}>
      <OnboardingPageInner />
    </Suspense>
  );
}
