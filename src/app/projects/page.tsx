"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { FolderKanban, Loader2, MoreHorizontal, Zap } from "lucide-react";
import NewProjectWizard from "@/components/projects/NewProjectWizard";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {empty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EFF6FF]">
            <FolderKanban className="h-7 w-7 text-[#2563EB]" />
          </div>
          <h3 className="mb-1 text-[16px] font-semibold text-[#111827]">No projects yet</h3>
          <p className="max-w-sm text-[13px] leading-relaxed text-[#6B7280]">
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
              className="cursor-pointer overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.07)] transition-all hover:border-[#D1D5DB] hover:shadow-[0_4px_6px_-1px_rgb(0_0_0/0.07)]"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <div
                className={cn(
                  "h-1 w-full",
                  project.status === "active" && "bg-[#2563EB]",
                  project.status === "paused" && "bg-[#D97706]",
                  project.status === "completed" && "bg-[#E5E7EB]",
                )}
              />
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold leading-snug text-[#111827]">{project.title}</h3>
                    {project.goal ? (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#6B7280]">{project.goal}</p>
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
                      <summary className="list-none rounded-md p-1 hover:bg-[#F3F4F6]">
                        <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border border-[#E5E7EB] bg-white p-1 text-sm shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-[#F3F4F6]">Edit</button>
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-[#F3F4F6]">Pause/Resume</button>
                        <button className="w-full rounded px-2 py-1.5 text-left hover:bg-[#F3F4F6]">Archive</button>
                      </div>
                    </details>
                  </div>
                </div>
              {project.targetPosts ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#9CA3AF]">Progress</span>
                    <span className="text-[11px] font-medium text-[#374151]">
                      {project.postsPublished} / {project.targetPosts} posts
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div
                      className="h-full rounded-full bg-[#2563EB] transition-all"
                      style={{ width: `${Math.min((project.postsPublished / project.targetPosts) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-[#9CA3AF]">
                  {project.postsPublished} post{project.postsPublished !== 1 ? "s" : ""} published
                </p>
              )}

                <div className="flex items-center justify-between border-t border-[#F3F4F6] pt-1 text-[11px] text-[#9CA3AF]">
                  <span>
                  {project.linkedTopics[0]?.topicLabel ?? "No topics"}
                    {project.linkedTopics.length > 1 ? (
                      <span className="ml-1 text-[#9CA3AF]">+{project.linkedTopics.length - 1}</span>
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

