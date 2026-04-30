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
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const color =
    score < 5
      ? "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
      : score <= 7
        ? "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
        : "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{score}</span>;
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
        <div className="mb-4 h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mb-3 h-7 w-72 animate-pulse rounded bg-muted" />
        <div className="mb-2 h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mb-6 h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-56 animate-pulse rounded-lg border bg-muted/30" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="mb-3 text-sm text-muted-foreground">{error ?? "Project not found"}</p>
        <Link href="/projects" className="text-sm underline">
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
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[#6B7280] transition-colors hover:text-[#111827]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Projects
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2.5">
              {statusBadge(project.status)}
              {project.arcType ? <span className="text-[11px] text-[#9CA3AF]">{arcTypeLabel(project.arcType)}</span> : null}
            </div>
            <h1 className="text-[20px] font-semibold leading-tight text-[#111827]">{project.title}</h1>
            {project.goal ? <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">{project.goal}</p> : null}
            {project.targetAudience ? <p className="mt-0.5 text-[12px] text-[#9CA3AF]">For: {project.targetAudience}</p> : null}
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
              <div className="absolute right-0 top-9 z-10 mt-1 w-36 rounded-md border border-[#E5E7EB] bg-white p-1 text-sm shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
                {["Edit", "Pause/Resume", "Archive project"].map((item) => (
                  <button
                    key={item}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-[#F3F4F6]"
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
          <div className="mt-4 border-t border-[#F3F4F6] pt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] text-[#6B7280]">
                {project.postsPublished} of {project.targetPosts} posts published
              </span>
              {project.startDate ? <span className="text-[12px] text-[#9CA3AF]">Started {startDateLabel}</span> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
              <div
                className="h-full rounded-full bg-[#2563EB] transition-all"
                style={{ width: `${Math.min((project.postsPublished / project.targetPosts) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="-mt-1 mb-5 flex border-b border-[#E5E7EB]">
        {(["Posts", "Topics", "Settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "border-b-2 -mb-px px-4 py-2.5 text-[13.5px] font-medium transition-colors",
              activeTab === tab
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-[#6B7280] hover:text-[#374151]",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Posts" ? (
        <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
          {project.recentPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-8 w-8 text-[#D1D5DB]" />
              <p className="text-[13.5px] font-medium text-[#374151]">No posts yet</p>
              <p className="mt-0.5 text-[12px] text-[#9CA3AF]">Generate your first post for this project above</p>
            </div>
          ) : (
            project.recentPosts.map((post, index) => {
              const position = Math.max(1, project.postsPublished - index);
              const firstLine = post.contentSnapshot.split("\n")[0] ?? "";
              return (
                <div
                  key={post.id}
                  className="-mx-4 flex items-center gap-3 border-b border-[#F3F4F6] px-4 py-3 transition-colors last:border-0 hover:bg-[#FAFAFA]"
                >
                  <span className="w-6 shrink-0 font-mono text-[12px] text-[#9CA3AF]">#{position}</span>
                  <span className="w-20 shrink-0 text-[12px] text-[#9CA3AF]">
                    {post.publishedAt ? format(new Date(post.publishedAt), "MMM d") : "—"}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-[#374151]">{firstLine}</span>
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
          <div className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
            {project.linkedTopics.map((topic) => (
              <div key={topic.topicSubscriptionId} className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13.5px] font-medium text-[#111827]">{topic.topicLabel}</p>
                  <button className="text-[12px] text-[#9CA3AF] hover:text-[#DC2626]" onClick={() => unlinkTopic(topic.topicSubscriptionId)}>
                    ×
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-[12px] text-[#6B7280]">Priority:</span>
                  {[1, 2, 3, 4, 5].map((weight) => (
                    <button
                      key={weight}
                      onClick={() => handlePriorityChange(topic.topicSubscriptionId, weight)}
                      className={cn(
                        "h-6 w-6 rounded border text-[11px]",
                        topic.priorityWeight === weight
                          ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                          : "border-[#E5E7EB] text-[#6B7280] hover:bg-[#F3F4F6]",
                      )}
                    >
                      {weight}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {project.linkedTopics.length === 0 ? <p className="text-sm text-[#6B7280]">No linked topics yet.</p> : null}
            <div>
              <button
                onClick={() => setShowLinkTopic((prev) => !prev)}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[13px] text-[#9CA3AF] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <Plus className="h-4 w-4" />+ Link topic
              </button>
              {showLinkTopic ? (
                <div className="mt-2 w-full max-w-sm rounded-md border border-[#E5E7EB] bg-white p-1">
                  {availableToLink.map((topic) => (
                    <button
                      key={topic.id}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#F3F4F6]"
                      onClick={() => linkTopic(topic.id)}
                    >
                      {topic.topicLabel}
                    </button>
                  ))}
                  {availableToLink.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No more topics to link</p> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Project-specific topics</p>
            <p className="text-xs text-muted-foreground">These only affect this project, not your global research.</p>
            <div className="flex flex-wrap gap-2">
              {project.projectTopics.map((topic) => (
                <button
                  key={topic}
                  onClick={() => removeProjectTopic(topic)}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                >
                  {topic}
                  <X className="h-3 w-3" />
                </button>
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
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project name</label>
            <Input value={settingsForm.title} onChange={(e) => setSettingsForm((prev) => ({ ...prev, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Goal</label>
            <Textarea rows={2} value={settingsForm.goal} onChange={(e) => setSettingsForm((prev) => ({ ...prev, goal: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Target audience</label>
            <Textarea rows={2} value={settingsForm.targetAudience} onChange={(e) => setSettingsForm((prev) => ({ ...prev, targetAudience: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Narrative style</label>
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
              <label className="text-sm font-medium">Start date</label>
              <Input type="date" value={settingsForm.startDate} onChange={(e) => setSettingsForm((prev) => ({ ...prev, startDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End date</label>
              <Input type="date" value={settingsForm.endDate} onChange={(e) => setSettingsForm((prev) => ({ ...prev, endDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target posts</label>
              <Input
                type="number"
                min={1}
                value={settingsForm.targetPosts}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, targetPosts: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Post type preferences</label>
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
            <label className="text-sm font-medium">Series hashtags</label>
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
                <button
                  key={tag}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                  onClick={() => setSettingsForm((prev) => ({ ...prev, hashtags: prev.hashtags.filter((item) => item !== tag) }))}
                >
                  {tag}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
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
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
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

