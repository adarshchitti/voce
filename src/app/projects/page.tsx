"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { FolderKanban, Loader2, MoreHorizontal } from "lucide-react";
import NewProjectWizard from "@/components/projects/NewProjectWizard";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
    return <Badge className="border-green-200 bg-green-100 text-green-800">active</Badge>;
  }
  if (status === "paused") {
    return <Badge className="border-amber-200 bg-amber-100 text-amber-800">paused</Badge>;
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Your content series and ongoing campaigns</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>+ New Project</Button>
      </div>

      {loading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {empty ? (
        <div className="flex h-[55vh] flex-col items-center justify-center text-center">
          <FolderKanban className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No projects yet</h2>
          <p className="mb-6 max-w-md text-sm text-muted-foreground">
            Projects help you build consistent content series with a clear goal and audience in mind.
          </p>
          <Button onClick={() => setWizardOpen(true)}>+ Create your first project</Button>
        </div>
      ) : null}

      {!loading && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <div className="flex items-center justify-between">
                {statusBadge(project.status)}
                <details
                  className="relative"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <summary className="list-none rounded-md p-1 hover:bg-accent">
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border bg-background p-1 text-sm shadow-sm">
                    <button className="w-full rounded px-2 py-1.5 text-left hover:bg-accent">Edit</button>
                    <button className="w-full rounded px-2 py-1.5 text-left hover:bg-accent">Pause/Resume</button>
                    <button className="w-full rounded px-2 py-1.5 text-left hover:bg-accent">Archive</button>
                  </div>
                </details>
              </div>

              <h3 className="text-base font-semibold leading-snug">{project.title}</h3>

              {project.goal ? <p className="line-clamp-2 text-sm text-muted-foreground">{project.goal}</p> : null}

              {project.targetPosts ? (
                <div className="space-y-1">
                  <Progress value={Math.min(100, (project.postsPublished / project.targetPosts) * 100)} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {project.postsPublished} / {project.targetPosts} posts
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{project.postsPublished} posts published</p>
              )}

              <div className="mt-auto flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span>
                  {project.linkedTopics[0]?.topicLabel ?? "No topics"}
                  {project.linkedTopics.length > 1 ? ` +${project.linkedTopics.length - 1} more` : ""}
                </span>
                <span>
                  {project.lastPublishedAt ? formatDistanceToNow(new Date(project.lastPublishedAt), { addSuffix: true }) : "No posts yet"}
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
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate next post"
                )}
              </Button>
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

