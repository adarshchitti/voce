"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, chipVariants } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type LinkedTopic = {
  topicSubscriptionId: string;
  topicLabel: string;
  priorityWeight: number;
};

type RecentPost = {
  id: string;
  contentSnapshot: string;
  status: string;
  publishedAt: string | null;
  scheduledAt: string;
  voiceScore: number | null;
};

type ProjectDetail = {
  id: string;
  title: string;
  goal: string | null;
  targetAudience: string | null;
  status: string;
  arcType: string | null;
  startDate: string | null;
  endDate: string | null;
  targetPosts: number | null;
  postTypePreferences: string[];
  autoGenerate: boolean;
  hashtags: string[];
  createdAt: string;
  updatedAt: string;
  postsPublished: number;
  lastPublishedAt: string | null;
  linkedTopics: LinkedTopic[];
  description: string | null;
  projectSourceUrls: string[];
  projectTopics: string[];
  recentPosts: RecentPost[];
};

type TopicOption = { id: string; topicLabel: string };

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success">active</Badge>;
  if (status === "paused") return <Badge variant="warning">paused</Badge>;
  return <Badge variant="secondary">completed</Badge>;
}

function arcTypeLabel(arcType: string) {
  const labels: Record<string, string> = {
    build_in_public: "Build in public",
    tutorial_sequence: "Tutorial sequence",
    weekly_recurring: "Weekly recurring",
    project_journey: "Project journey",
    framework_series: "Framework series",
    open_ended: "Open ended",
  };
  return labels[arcType] ?? arcType;
}

function voiceBadge(score: number | null) {
  if (score === null) return null;
  const variant = score < 5 ? "flagged" : score <= 7 ? "warning" : "success";
  return <Badge variant={variant}>{score}</Badge>;
}

const postTypeOptions = [
  { id: "thought_leadership", label: "Thought leadership" },
  { id: "build_in_public", label: "Build in public" },
  { id: "tutorial_explainer", label: "Tutorial / How-to" },
  { id: "personal_story", label: "Personal story" },
  { id: "industry_news_take", label: "Industry news" },
  { id: "data_insight", label: "Data insight" },
  { id: "tool_review", label: "Tool review" },
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const projectId = params?.id;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"Posts" | "Topics" | "Settings">("Posts");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [topicsAll, setTopicsAll] = useState<TopicOption[]>([]);
  const [showLinkTopic, setShowLinkTopic] = useState(false);
  const [projectTopicInput, setProjectTopicInput] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hashtagInput, setHashtagInput] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    title: "",
    goal: "",
    targetAudience: "",
    arcType: "",
    startDate: "",
    endDate: "",
    targetPosts: "",
    postTypePreferences: [] as string[],
    hashtags: [] as string[],
    autoGenerate: true,
  });

  async function loadProject() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [projectRes, topicsRes] = await Promise.all([fetch(`/api/projects/${projectId}`), fetch("/api/topics")]);
      const projectData = await projectRes.json();
      const topicsData = await topicsRes.json();
      if (!projectRes.ok || !projectData.project) throw new Error(projectData.error ?? "Project not found");
      const loaded = projectData.project as ProjectDetail;
      setProject(loaded);
      setTopicsAll((topicsData.topics ?? []).map((topic: { id: string; topicLabel: string }) => ({ id: topic.id, topicLabel: topic.topicLabel })));
      setSettingsForm({
        title: loaded.title ?? "",
        goal: loaded.goal ?? "",
        targetAudience: loaded.targetAudience ?? "",
        arcType: loaded.arcType ?? "",
        startDate: loaded.startDate ?? "",
        endDate: loaded.endDate ?? "",
        targetPosts: loaded.targetPosts ? String(loaded.targetPosts) : "",
        postTypePreferences: loaded.postTypePreferences ?? [],
        hashtags: loaded.hashtags ?? [],
        autoGenerate: loaded.autoGenerate ?? true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleGenerate() {
    if (!projectId) return;
    setGenerateLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Generation failed", "error");
      } else {
        showToast(`Draft added to inbox · Post #${data.seriesPosition}`, "success", { label: "View inbox", href: "/inbox" });
      }
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function updateProjectPatch(payload: Record<string, unknown>) {
    if (!projectId || !project) return false;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ?? "Failed to update project", "error");
      return false;
    }
    await loadProject();
    return true;
  }

  async function handlePriorityChange(topicId: string, nextPriority: number) {
    if (!projectId || !project) return;
    const previous = project.linkedTopics;
    setProject({
      ...project,
      linkedTopics: project.linkedTopics.map((topic) =>
        topic.topicSubscriptionId === topicId ? { ...topic, priorityWeight: nextPriority } : topic,
      ),
    });
    const res = await fetch(`/api/projects/${projectId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicSubscriptionId: topicId, priorityWeight: nextPriority }),
    });
    if (!res.ok) {
      setProject({ ...project, linkedTopics: previous });
      showToast("Failed to update topic priority", "error");
    }
  }

  async function unlinkTopic(topicId: string) {
    if (!projectId || !project) return;
    const previous = project.linkedTopics;
    setProject({ ...project, linkedTopics: previous.filter((topic) => topic.topicSubscriptionId !== topicId) });
    const res = await fetch(`/api/projects/${projectId}/topics`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicSubscriptionId: topicId }),
    });
    if (!res.ok) {
      setProject({ ...project, linkedTopics: previous });
      showToast("Failed to unlink topic", "error");
    }
  }

  async function linkTopic(topicId: string) {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicSubscriptionId: topicId, priorityWeight: 3 }),
    });
    if (!res.ok) {
      showToast("Failed to link topic", "error");
      return;
    }
    await loadProject();
    setShowLinkTopic(false);
  }

  async function addProjectTopic() {
    if (!project || !projectTopicInput.trim()) return;
    const nextTopics = Array.from(new Set([...project.projectTopics, projectTopicInput.trim()]));
    const ok = await updateProjectPatch({ projectTopics: nextTopics });
    if (ok) setProjectTopicInput("");
  }

  async function removeProjectTopic(topic: string) {
    if (!project) return;
    await updateProjectPatch({ projectTopics: project.projectTopics.filter((item) => item !== topic) });
  }

  async function saveSettings() {
    if (!projectId) return;
    setSettingsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settingsForm.title,
          goal: settingsForm.goal || null,
          targetAudience: settingsForm.targetAudience || null,
          arcType: settingsForm.arcType || null,
          startDate: settingsForm.startDate || null,
          endDate: settingsForm.endDate || null,
          targetPosts: settingsForm.targetPosts ? Number(settingsForm.targetPosts) : null,
          postTypePreferences: settingsForm.postTypePreferences,
          hashtags: settingsForm.hashtags,
          autoGenerate: settingsForm.autoGenerate,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? "Failed to save project", "error");
      } else {
        showToast("Project updated");
        await loadProject();
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  async function archiveProject() {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      showToast("Failed to archive project", "error");
      return;
    }
    router.push("/projects");
  }

  const availableToLink = useMemo(() => {
    if (!project) return [];
    const linked = new Set(project.linkedTopics.map((topic) => topic.topicSubscriptionId));
    return topicsAll.filter((topic) => !linked.has(topic.id));
  }, [project, topicsAll]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-4 h-8 w-40 animate-pulse rounded bg-paper-sunk" />
        <div className="mb-3 h-7 w-72 animate-pulse rounded bg-paper-sunk" />
        <div className="mb-2 h-4 w-full animate-pulse rounded bg-paper-sunk" />
        <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-paper-sunk" />
        <div className="mb-6 h-3 w-full animate-pulse rounded bg-paper-sunk" />
        <div className="h-56 animate-pulse rounded-[10px] border-2 border-ink bg-paper-sunk" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="mb-3 text-sm text-ink-2">{error ?? "Project not found"}</p>
        <Link href="/projects" className="link-rule text-sm text-ink">
          ← Back to Projects
        </Link>
      </div>
    );
  }

  const startDateLabel = project.startDate ? format(new Date(project.startDate), "MMM yyyy") : "Unknown start";

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push("/projects")}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Projects
        </button>
      </div>

      <div className="mb-6 rounded-[10px] border-2 border-ink bg-surface shadow-card">
        <div
          className={cn(
            "h-3 w-full rounded-t-[8px] border-b-2 border-ink",
            project.status === "active" && "bg-p-blue",
            project.status === "paused" && "bg-p-amber",
            project.status === "completed" && "bg-paper-sunk",
          )}
        />
        <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2.5">
              {statusBadge(project.status)}
              {project.arcType ? (
                <Chip tone="lilac" size="sm">
                  {arcTypeLabel(project.arcType)}
                </Chip>
              ) : null}
            </div>
            <h1 className="display-3 text-ink">{project.title}</h1>
            {project.goal ? <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{project.goal}</p> : null}
            {project.targetAudience ? (
              <div className="mt-1.5">
                <Chip tone="blue" size="sm">
                  For: {project.targetAudience}
                </Chip>
              </div>
            ) : null}
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <Button onClick={handleGenerate} disabled={generateLoading} size="sm" className="gap-1.5">
              {generateLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Generate next post
                </>
              )}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowMoreMenu((prev) => !prev)} aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showMoreMenu ? (
              <div className="absolute right-0 top-9 z-10 mt-1 w-36 rounded-[10px] border-2 border-ink bg-surface p-1 text-sm text-ink shadow-xs">
                {["Edit", "Pause/Resume", "Archive project"].map((item) => (
                  <button
                    key={item}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-paper-sunk"
                    onClick={() => {
                      setShowMoreMenu(false);
                      showToast("Coming soon");
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {project.targetPosts ? (
          <div className="mt-4 border-t border-hairline pt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] text-ink-2">
                {project.postsPublished} of {project.targetPosts} posts published
              </span>
              {project.startDate ? <span className="eyebrow text-ink-3">Started {startDateLabel}</span> : null}
            </div>
            <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-surface">
              <div
                className="h-full bg-p-blue transition-all"
                style={{ width: `${Math.min((project.postsPublished / project.targetPosts) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : null}
        </div>
      </div>

      <div className="-mt-1 mb-5 flex border-b-2 border-ink">
        {(["Posts", "Topics", "Settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "-mb-[2px] border-b-4 px-4 py-2.5 text-[13.5px] font-medium transition-colors",
              activeTab === tab
                ? "border-accent-solid text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Posts" ? (
        <div className="mt-4 overflow-hidden rounded-[10px] border-2 border-ink bg-surface">
          {project.recentPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-8 w-8 text-ink-3" />
              <p className="text-[13.5px] font-medium text-ink">No posts yet</p>
              <p className="mt-0.5 text-[12px] text-ink-2">Generate your first post for this project above</p>
            </div>
          ) : (
            project.recentPosts.map((post, index) => {
              const position = Math.max(1, project.postsPublished - index);
              const firstLine = post.contentSnapshot.split("\n")[0] ?? "";
              return (
                <div
                  key={post.id}
                  className="flex items-center gap-3 border-b border-hairline px-4 py-3 transition-colors last:border-0 hover:bg-paper-sunk"
                >
                  <span className="w-6 shrink-0 font-mono text-[12px] text-ink-3">#{position}</span>
                  <span className="w-20 shrink-0 text-[12px] text-ink-3">
                    {post.publishedAt ? format(new Date(post.publishedAt), "MMM d") : "—"}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-ink">{firstLine}</span>
                  <span className="ml-auto">{voiceBadge(post.voiceScore)}</span>
                  {post.status === "published" ? (
                    <Badge variant="success" className="shrink-0 text-[11px]">
                      published
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="shrink-0 text-[11px]">
                      {post.status}
                    </Badge>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {activeTab === "Topics" ? (
        <div className="mt-4 space-y-6">
          <div className="space-y-3 rounded-[10px] border-2 border-ink bg-surface p-4 shadow-card">
            {project.linkedTopics.map((topic) => (
              <div key={topic.topicSubscriptionId} className="space-y-3 rounded-[10px] border border-hairline bg-paper-sunk p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Chip
                    tone="neutral"
                    size="lg"
                    onRemove={() => unlinkTopic(topic.topicSubscriptionId)}
                    removeLabel={`Unlink topic ${topic.topicLabel}`}
                  >
                    {topic.topicLabel}
                  </Chip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="eyebrow mr-1 text-ink-3">Priority:</span>
                  {[1, 2, 3, 4, 5].map((weight) => (
                    <button
                      key={weight}
                      onClick={() => handlePriorityChange(topic.topicSubscriptionId, weight)}
                      aria-pressed={topic.priorityWeight === weight}
                      className={cn(
                        chipVariants({
                          tone: topic.priorityWeight === weight ? "accent" : "surface",
                          variant: topic.priorityWeight === weight ? "solid" : "dashed",
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
            ))}
            {project.linkedTopics.length === 0 ? <p className="text-sm text-ink-2">No linked topics yet.</p> : null}
            <div>
              <button
                onClick={() => setShowLinkTopic((prev) => !prev)}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-ink text-[13px] text-ink-2 transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <Plus className="h-4 w-4" />+ Link topic
              </button>
              {showLinkTopic ? (
                <div className="mt-2 w-full max-w-sm rounded-[10px] border-2 border-ink bg-surface p-1 shadow-xs">
                  {availableToLink.map((topic) => (
                    <button
                      key={topic.id}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-paper-sunk"
                      onClick={() => linkTopic(topic.id)}
                    >
                      {topic.topicLabel}
                    </button>
                  ))}
                  {availableToLink.length === 0 ? <p className="px-2 py-1.5 text-sm text-ink-2">No more topics to link</p> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Project-specific topics</p>
            <p className="text-xs text-ink-2">These only affect this project, not your global research.</p>
            <div className="flex flex-wrap gap-2">
              {project.projectTopics.map((topic) => (
                <Chip
                  key={topic}
                  tone="neutral"
                  onRemove={() => removeProjectTopic(topic)}
                  removeLabel={`Remove topic ${topic}`}
                >
                  {topic}
                </Chip>
              ))}
            </div>
            <div className="flex max-w-sm gap-2">
              <Input
                placeholder="Add topic"
                value={projectTopicInput}
                onChange={(e) => setProjectTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addProjectTopic();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => void addProjectTopic()}>
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "Settings" ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-4 rounded-[10px] border-2 border-ink bg-surface p-5 shadow-card">
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Project name</label>
            <Input value={settingsForm.title} onChange={(e) => setSettingsForm((prev) => ({ ...prev, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Goal</label>
            <Textarea
              rows={2}
              maxLength={300}
              value={settingsForm.goal}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, goal: e.target.value }))}
            />
            <p className="text-xs text-ink-2">Keep it concise — one sentence works best</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Target audience</label>
            <Textarea
              rows={2}
              maxLength={200}
              value={settingsForm.targetAudience}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, targetAudience: e.target.value }))}
            />
            <p className="text-xs text-ink-2">Describe your reader in 1-2 sentences</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Narrative style</label>
            <Select
              value={settingsForm.arcType || "none"}
              onValueChange={(value) =>
                setSettingsForm((prev) => ({ ...prev, arcType: value && value !== "none" ? value : "" }))
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Start date</label>
              <Input type="date" value={settingsForm.startDate} onChange={(e) => setSettingsForm((prev) => ({ ...prev, startDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">End date</label>
              <Input type="date" value={settingsForm.endDate} onChange={(e) => setSettingsForm((prev) => ({ ...prev, endDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Target posts</label>
              <Input
                type="number"
                min={1}
                value={settingsForm.targetPosts}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, targetPosts: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Post type preferences</label>
            <div className="grid grid-cols-2 gap-2">
              {postTypeOptions.map((postType) => {
                const selected = settingsForm.postTypePreferences.includes(postType.id);
                return (
                  <button
                    key={postType.id}
                    type="button"
                    onClick={() =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        postTypePreferences: selected
                          ? prev.postTypePreferences.filter((item) => item !== postType.id)
                          : [...prev.postTypePreferences, postType.id],
                      }))
                    }
                    className={cn(
                      "rounded-[10px] border-2 border-ink px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-p-blue text-ink" : "bg-surface text-ink-2 hover:bg-paper-sunk hover:text-ink",
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
            <label className="text-sm font-medium text-ink">Series hashtags</label>
            <div className="flex max-w-sm gap-2">
              <Input
                placeholder="Add hashtag"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const value = hashtagInput.trim();
                    if (!value) return;
                    const formatted = value.startsWith("#") ? value : `#${value}`;
                    setSettingsForm((prev) => ({
                      ...prev,
                      hashtags: prev.hashtags.includes(formatted) ? prev.hashtags : [...prev.hashtags, formatted],
                    }));
                    setHashtagInput("");
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {settingsForm.hashtags.map((tag) => (
                <Chip
                  key={tag}
                  tone="blue"
                  onRemove={() => setSettingsForm((prev) => ({ ...prev, hashtags: prev.hashtags.filter((item) => item !== tag) }))}
                  removeLabel={`Remove hashtag ${tag}`}
                >
                  {tag}
                </Chip>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-accent-solid"
              checked={settingsForm.autoGenerate}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, autoGenerate: e.target.checked }))}
            />
            Auto-generate
          </label>
          <Button onClick={saveSettings} disabled={settingsSaving}>
            {settingsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>

          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
            <p className="mb-3 mt-1 text-sm text-ink-2">
              Archive this project. Posts will be preserved. The project will no longer generate new drafts.
            </p>
            {!archiveConfirm ? (
              <Button variant="destructive" size="sm" onClick={() => setArchiveConfirm(true)}>
                Archive project
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span>Are you sure?</span>
                <Button variant="outline" size="sm" onClick={() => setArchiveConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={archiveProject}>
                  Yes, archive
                </Button>
              </div>
            )}
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

