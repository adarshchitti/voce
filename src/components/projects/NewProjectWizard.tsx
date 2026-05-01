"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

const STEP_LABELS = ["Name & Goal", "Audience", "Topics", "Post Types", "Review"];

type TopicRow = { id: string; topicLabel: string };
type SelectedTopic = { id: string; label: string; priorityWeight: number };

const initialFormData = () => ({
  title: "",
  goal: "",
  targetAudience: "",
  arcType: "",
  targetPosts: undefined as number | undefined,
  startDate: new Date().toISOString().split("T")[0],
  postTypes: [] as string[],
  hashtags: [] as string[],
  autoGenerate: true,
  selectedTopics: [] as SelectedTopic[],
  projectTopics: [] as string[],
});

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
      {STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const done = step < currentStep;
        const current = step === currentStep;
        return (
          <div key={label} className="flex min-w-fit items-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[11px]",
                done && "border-muted-foreground bg-muted text-muted-foreground",
                current && "border-foreground bg-background font-semibold text-foreground",
                !done && !current && "border-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : step}
            </div>
            <span className={cn(done && "text-muted-foreground", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {step < STEP_LABELS.length ? <div className="h-px w-6 bg-border" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function NewProjectWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [projectTopicInput, setProjectTopicInput] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [formData, setFormData] = useState(initialFormData());

  function resetWizard() {
    setStep(1);
    setCreating(false);
    setTopics([]);
    setTopicsLoading(false);
    setProjectTopicInput("");
    setHashtagInput("");
    setFormData(initialFormData());
  }

  async function handleDialogChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      setTopicsLoading(true);
      try {
        const res = await fetch("/api/topics");
        const data = await res.json();
        setTopics((data.topics ?? []).map((topic: { id: string; topicLabel: string }) => ({ id: topic.id, topicLabel: topic.topicLabel })));
      } catch {
        setTopics([]);
      } finally {
        setTopicsLoading(false);
      }
      return;
    }
    onOpenChange(false);
    resetWizard();
  }

  const selectedTopicMap = useMemo(() => new Map(formData.selectedTopics.map((topic) => [topic.id, topic])), [formData.selectedTopics]);

  function toggleTopic(topic: TopicRow) {
    setFormData((prev) => {
      const exists = prev.selectedTopics.some((selected) => selected.id === topic.id);
      return {
        ...prev,
        selectedTopics: exists
          ? prev.selectedTopics.filter((selected) => selected.id !== topic.id)
          : [...prev.selectedTopics, { id: topic.id, label: topic.topicLabel, priorityWeight: 3 }],
      };
    });
  }

  function setTopicPriority(topicId: string, priorityWeight: number) {
    setFormData((prev) => ({
      ...prev,
      selectedTopics: prev.selectedTopics.map((topic) => (topic.id === topicId ? { ...topic, priorityWeight } : topic)),
    }));
  }

  function addProjectTopic() {
    const value = projectTopicInput.trim();
    if (!value) return;
    if (!formData.projectTopics.includes(value)) {
      setFormData((prev) => ({ ...prev, projectTopics: [...prev.projectTopics, value] }));
    }
    setProjectTopicInput("");
  }

  function addHashtag() {
    const raw = hashtagInput.trim();
    if (!raw) return;
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!formData.hashtags.includes(tag)) {
      setFormData((prev) => ({ ...prev, hashtags: [...prev.hashtags, tag] }));
    }
    setHashtagInput("");
  }

  function togglePostType(postType: string) {
    setFormData((prev) => ({
      ...prev,
      postTypes: prev.postTypes.includes(postType)
        ? prev.postTypes.filter((item) => item !== postType)
        : [...prev.postTypes, postType],
    }));
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          goal: formData.goal || undefined,
          targetAudience: formData.targetAudience || undefined,
          arcType: formData.arcType || undefined,
          targetPosts: formData.targetPosts || undefined,
          startDate: formData.startDate || undefined,
          postTypePreferences: formData.postTypes,
          hashtags: formData.hashtags,
          autoGenerate: formData.autoGenerate,
          linkedTopics: formData.selectedTopics.map((topic) => ({
            topicSubscriptionId: topic.id,
            priorityWeight: topic.priorityWeight,
          })),
          projectTopics: formData.projectTopics,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create project");
      showToast("Project created");
      onCreated?.();
      onOpenChange(false);
      resetWizard();
      router.push(`/projects/${data.project.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create project", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create a focused content series in five quick steps.</DialogDescription>
        </DialogHeader>
        <StepIndicator currentStep={step} />

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project name</label>
              <Input
                placeholder="e.g. Building Voce in Public"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Goal</label>
              <Textarea
                rows={2}
                maxLength={300}
                placeholder="e.g. Generate inbound leads from CTOs exploring AI agents"
                value={formData.goal}
                onChange={(e) => setFormData((prev) => ({ ...prev, goal: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Keep it concise — one sentence works best</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start date</label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target posts</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 12"
                  value={formData.targetPosts ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      targetPosts: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target audience</label>
              <Textarea
                rows={3}
                maxLength={200}
                placeholder="e.g. CTOs and senior engineers at Series A-C startups exploring production AI systems"
                value={formData.targetAudience}
                onChange={(e) => setFormData((prev) => ({ ...prev, targetAudience: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Describe your reader in 1-2 sentences</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Narrative style</label>
              <Select
                value={formData.arcType || "none"}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, arcType: value && value !== "none" ? value : "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No specific style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific style</SelectItem>
                  <SelectItem value="build_in_public">Build in public - ongoing project documentation</SelectItem>
                  <SelectItem value="tutorial_sequence">Tutorial series - numbered educational arc</SelectItem>
                  <SelectItem value="weekly_recurring">Weekly recurring - same format every week</SelectItem>
                  <SelectItem value="project_journey">Project journey - start to challenge to outcome</SelectItem>
                  <SelectItem value="framework_series">Framework series - developing a named framework</SelectItem>
                  <SelectItem value="open_ended">Open ended - no defined arc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Existing topic subscriptions</p>
              {topicsLoading ? <p className="text-sm text-muted-foreground">Loading topics...</p> : null}
              <div className="space-y-2">
                {topics.map((topic) => {
                  const selected = selectedTopicMap.get(topic.id);
                  return (
                    <div
                      key={topic.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        selected ? "border-primary bg-primary/5" : "hover:bg-accent/40",
                      )}
                    >
                      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleTopic(topic)}>
                        <span className="text-sm font-medium">{topic.topicLabel}</span>
                        <span className={cn("text-xs", selected ? "text-primary" : "text-muted-foreground")}>{selected ? "Selected" : "Select"}</span>
                      </button>
                      {selected ? (
                        <div className="mt-2 flex items-center gap-1">
                          <span className="mr-1 text-xs text-muted-foreground">Priority:</span>
                          {[1, 2, 3, 4, 5].map((weight) => (
                            <button
                              key={weight}
                              type="button"
                              onClick={() => setTopicPriority(topic.id, weight)}
                              className={cn(
                                "h-6 w-6 rounded border text-[11px]",
                                selected.priorityWeight === weight ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                              )}
                            >
                              {weight}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!topicsLoading && topics.length === 0 ? <p className="text-sm text-muted-foreground">No global topics yet.</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Project-specific topics (optional)</p>
              <p className="text-xs text-muted-foreground">These only apply to this project - they will not change your global research.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Add topic"
                  value={projectTopicInput}
                  onChange={(e) => setProjectTopicInput(e.target.value)}
                  onBlur={addProjectTopic}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addProjectTopic();
                    }
                  }}
                />
                <Button variant="outline" onClick={addProjectTopic}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.projectTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, projectTopics: prev.projectTopics.filter((item) => item !== topic) }))}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                  >
                    {topic}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">What kinds of posts should this project generate?</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "thought_leadership", label: "Thought leadership" },
                  { id: "build_in_public", label: "Build in public" },
                  { id: "tutorial_explainer", label: "Tutorial / How-to" },
                  { id: "personal_story", label: "Personal story" },
                  { id: "industry_news_take", label: "Industry news" },
                  { id: "data_insight", label: "Data insight" },
                  { id: "tool_review", label: "Tool review" },
                ].map((postType) => {
                  const selected = formData.postTypes.includes(postType.id);
                  return (
                    <button
                      key={postType.id}
                      type="button"
                      onClick={() => togglePostType(postType.id)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                      )}
                    >
                      {selected ? "✓ " : ""}
                      {postType.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Series hashtags (optional) - added to every post in this project</label>
              <Input
                placeholder="Type hashtag and press Enter"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onBlur={addHashtag}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {formData.hashtags.map((hashtag) => (
                  <button
                    key={hashtag}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, hashtags: prev.hashtags.filter((item) => item !== hashtag) }))}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                  >
                    {hashtag}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.autoGenerate}
                onChange={(e) => setFormData((prev) => ({ ...prev, autoGenerate: e.target.checked }))}
              />
              Automatically generate posts for this project during daily drafts
            </label>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="rounded-lg border bg-card p-4 text-sm">
            <h3 className="mb-3 text-base font-semibold">{formData.title || "Untitled project"}</h3>
            <div className="space-y-2 text-muted-foreground">
              <p><span className="font-medium text-foreground">Goal:</span> {formData.goal || "—"}</p>
              <p><span className="font-medium text-foreground">Audience:</span> {formData.targetAudience || "—"}</p>
              <p><span className="font-medium text-foreground">Topics:</span> {formData.selectedTopics.map((topic) => topic.label).join(" · ") || "—"}</p>
              <p><span className="font-medium text-foreground">Post types:</span> {formData.postTypes.join(" · ") || "—"}</p>
              <p><span className="font-medium text-foreground">Timeline:</span> {formData.startDate || "—"} {formData.targetPosts ? `→ ${formData.targetPosts} posts` : "→ ongoing"}</p>
              <p><span className="font-medium text-foreground">Auto-generate:</span> {formData.autoGenerate ? "On" : "Off"}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1 || creating}>
            ← Back
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep((prev) => Math.min(5, prev + 1))} disabled={step === 1 && !formData.title.trim()}>
              Next →
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Project"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

