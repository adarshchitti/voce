"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { FolderKanban, Loader2, MoreHorizontal, Zap } from "lucide-react";
import NewProjectWizard from "@/components/projects/NewProjectWizard";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  title: string;
  goal: string | null;
  status: string;
  targetPosts: number | null;
  postsPublished: number;
  lastPublishedAt: string | null;
  linkedTopics: Array<{ topicLabel: string }>;
};

function statusBadge(status: string) {
  if (status === "active") {
    return <Badge variant="success">active</Badge>;
  }
  if (status === "paused") {
    return <Badge variant="warning">paused</Badge>;
  }
  return <Badge variant="secondary">completed</Badge>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleGenerate(projectId: string) {
    setGeneratingId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? data.message ?? "Generation failed", "error");
      } else {
        showToast(`Draft added to inbox (Post #${data.seriesPosition})`, "success", { label: "View inbox", href: "/inbox" });
      }
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setGeneratingId(null);
    }
  }

  const empty = useMemo(() => !loading && projects.length === 0, [loading, projects.length]);

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Content series and ongoing campaigns"
        action={<Button onClick={() => setWizardOpen(true)}>+ New Project</Button>}
      />

      {loading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
        </div>
      ) : null}

      {empty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[10px] border-2 border-ink bg-p-blue shadow-xs">
            <FolderKanban className="h-7 w-7 text-ink" />
          </div>
          <h3 className="display-3 mb-1 text-ink">No projects yet</h3>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
            Projects help you build consistent content with a clear goal, target audience, and timeline.
          </p>
          <Button className="mt-5" onClick={() => setWizardOpen(true)}>
            Create your first project
          </Button>
        </div>
      ) : null}

      {!loading && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="press-card cursor-pointer rounded-[10px] border-2 border-ink bg-surface"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <div
                className={cn(
                  "h-3 w-full rounded-t-[8px] border-b-2 border-ink",
                  project.status === "active" && "bg-p-blue",
                  project.status === "paused" && "bg-p-amber",
                  project.status === "completed" && "bg-paper-sunk",
                )}
              />
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold leading-snug text-ink">{project.title}</h3>
                    {project.goal ? (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">{project.goal}</p>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                    {statusBadge(project.status)}
                    <details
                      className="relative"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <summary className="list-none cursor-pointer rounded-md p-1 hover:bg-paper-sunk">
                        <MoreHorizontal className="h-4 w-4 text-ink-3" />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-[10px] border-2 border-ink bg-surface p-1 text-sm text-ink shadow-xs">
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-paper-sunk">Edit</button>
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-paper-sunk">Pause/Resume</button>
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-paper-sunk">Archive</button>
                      </div>
                    </details>
                  </div>
                </div>
              {project.targetPosts ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow text-ink-3">Progress</span>
                    <span className="text-[11px] font-medium tabular-nums text-ink">
                      {project.postsPublished} / {project.targetPosts} posts
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-surface">
                    <div
                      className="h-full bg-p-blue transition-all"
                      style={{ width: `${Math.min((project.postsPublished / project.targetPosts) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-ink-2">
                  {project.postsPublished} post{project.postsPublished !== 1 ? "s" : ""} published
                </p>
              )}

                <div className="flex items-center justify-between border-t border-hairline pt-2 text-[11px] text-ink-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {project.linkedTopics[0] ? (
                      <Chip tone="neutral" size="sm">
                        {project.linkedTopics[0].topicLabel}
                      </Chip>
                    ) : (
                      <Chip variant="dashed" size="sm">
                        No topics
                      </Chip>
                    )}
                    {project.linkedTopics.length > 1 ? (
                      <Chip variant="ghost" size="sm">
                        +{project.linkedTopics.length - 1}
                      </Chip>
                    ) : null}
                  </span>
                  <span>
                    {project.lastPublishedAt
                      ? formatDistanceToNow(new Date(project.lastPublishedAt), { addSuffix: true })
                      : "No posts yet"}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleGenerate(project.id);
                  }}
                  disabled={generatingId === project.id}
                >
                  {generatingId === project.id ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-1.5 h-3 w-3" />
                      Generate next post
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <NewProjectWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          void loadProjects();
        }}
      />
    </div>
  );
}

