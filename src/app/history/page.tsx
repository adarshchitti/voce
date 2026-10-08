"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight, Clock, ExternalLink, FileText, Inbox, Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { combineDateAndTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/Toast";

type Post = {
  id: string;
  status: string;
  contentSnapshot: string;
  scheduledAt: string;
  publishedAt: string | null;
  failureReason: string | null;
  manualImpressions: number | null;
  manualReactions: number | null;
  manualComments: number | null;
  linkedinPostId: string | null;
  seriesId: string | null;
  seriesPosition: number | null;
  voiceScore: number | null;
  seriesTitle: string | null;
};

type FilterKey = "all" | "scheduled" | "published" | "failed";

function StatusIcon({ status }: { status: string }) {
  if (status === "published") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-p-sage">
        <CheckCircle className="h-3.5 w-3.5 text-ink" />
      </div>
    );
  }
  if (status === "scheduled") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-p-blue">
        <Clock className="h-3.5 w-3.5 text-ink" />
      </div>
    );
  }
  if (status === "publishing") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-p-blue">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ink" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-p-coral">
        <XCircle className="h-3.5 w-3.5 text-ink" />
      </div>
    );
  }
  return null;
}

function RetryButton({ postId }: { postId: string }) {
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
      showToast("Retry scheduled", "success");
      router.refresh();
    } catch {
      showToast("Retry failed", "error");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
      {retrying ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Retrying...
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3" />
          Retry
        </>
      )}
    </Button>
  );
}

function MoveToInboxButton({
  postId,
  onSuccess,
}: {
  postId: string;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleMove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/unschedule`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error ?? "Failed to move post", "error");
      } else {
        showToast("Moved back to inbox", "success", {
          label: "Go to inbox",
          href: "/inbox",
        });
        onSuccess();
      }
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleMove} disabled={loading}>
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Moving...
        </>
      ) : (
        <>
          <Inbox className="h-3 w-3" />
          Move to inbox
        </>
      )}
    </Button>
  );
}

function RescheduleButton({
  postId,
  currentScheduledAt,
  onSuccess,
}: {
  postId: string;
  currentScheduledAt: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date(currentScheduledAt).toISOString().split("T")[0] ?? "");
  const [time, setTime] = useState(new Date(currentScheduledAt).toISOString().slice(11, 16));
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  async function handleReschedule() {
    setSaving(true);
    try {
      const scheduledAt = combineDateAndTime(date, time, "UTC");
      const res = await fetch(`/api/posts/${postId}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Post rescheduled", "success");
      setOpen(false);
      onSuccess();
    } catch {
      showToast("Reschedule failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="h-3 w-3" />
          Reschedule
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-4">
        <p className="text-[13px] font-medium text-ink">Reschedule post</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="eyebrow text-ink-3">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 px-2 text-[12px]"
            />
          </div>
          <div className="space-y-1">
            <label className="eyebrow text-ink-3">Time (UTC)</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-8 px-2 text-[12px]"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1" onClick={handleReschedule} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {saving ? "Saving..." : "Confirm"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ManualMetrics({ post }: { post: Post }) {
  const [impressions, setImpressions] = useState<string | number>(post.manualImpressions ?? "");
  const [reactions, setReactions] = useState<string | number>(post.manualReactions ?? "");
  const [comments, setComments] = useState<string | number>(post.manualComments ?? "");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/posts/${post.id}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualImpressions: impressions !== "" ? Number(impressions) : undefined,
          manualReactions: reactions !== "" ? Number(reactions) : undefined,
          manualComments: comments !== "" ? Number(comments) : undefined,
        }),
      });
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const hasMetrics = Boolean(post.manualImpressions || post.manualReactions || post.manualComments);

  return (
    <div className="mt-1">
      {hasMetrics && !open ? (
        <div className="flex items-center gap-3 text-[11px] text-ink-2">
          {post.manualImpressions ? <span>Impressions: {post.manualImpressions.toLocaleString()}</span> : null}
          {post.manualReactions ? <span>Reactions: {post.manualReactions}</span> : null}
          {post.manualComments ? <span>Comments: {post.manualComments}</span> : null}
          <button onClick={() => setOpen(true)} className="ml-auto text-accent-solid hover:underline">
            Edit
          </button>
        </div>
      ) : null}

      {!hasMetrics && !open ? (
        <button onClick={() => setOpen(true)} className="text-[11px] text-ink-3 transition-colors hover:text-ink">
          + Add manual metrics
        </button>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-[10px] border-2 border-ink bg-surface p-2.5">
          <div className="flex gap-2">
            <div className="min-w-[110px] flex-1">
              <Input
                type="number"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="0"
                className="h-7 px-2 text-[12px]"
              />
            </div>
            <div className="min-w-[90px] flex-1">
              <Input
                type="number"
                value={reactions}
                onChange={(e) => setReactions(e.target.value)}
                placeholder="0"
                className="h-7 px-2 text-[12px]"
              />
            </div>
            <div className="min-w-[90px] flex-1">
              <Input
                type="number"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="0"
                className="h-7 px-2 text-[12px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-0.5">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const messages = {
    all: { icon: FileText, title: "No posts yet", desc: "Approved drafts will appear here once scheduled." },
    scheduled: { icon: Clock, title: "Nothing scheduled", desc: "Approve a draft from your inbox to schedule a post." },
    published: { icon: CheckCircle, title: "Nothing published yet", desc: "Your published posts will appear here." },
    failed: { icon: XCircle, title: "No failed posts", desc: "Failed posts will appear here so you can retry them." },
  };
  const { icon: Icon, title, desc } = messages[filter] ?? messages.all;
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <Icon className="mb-3 h-8 w-8 text-ink-3" />
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      <p className="mt-0.5 max-w-xs text-[12px] text-ink-2">{desc}</p>
    </div>
  );
}

function PostRow({
  post,
  isLast,
  onMoveSuccess,
}: {
  post: Post;
  isLast: boolean;
  onMoveSuccess: (postId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = post.contentSnapshot.split("\n")[0] ?? "";
  return (
    <div className={cn("transition-colors hover:bg-paper-sunk", !isLast && "border-b border-hairline")}>
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded((prev) => !prev)}>
        <StatusIcon status={post.status} />
        <div className="w-20 shrink-0">
          <p className="text-[12px] font-medium text-ink">{format(new Date(post.scheduledAt), "MMM d")}</p>
          <p className="hidden text-[11px] text-ink-3 sm:block">{format(new Date(post.scheduledAt), "h:mm a")}</p>
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{firstLine}</p>
        {post.seriesId ? (
          <Chip tone="neutral" size="sm" className="hidden md:inline-flex">
            {`${post.seriesTitle?.slice(0, 20) ?? "Project"}${post.seriesPosition ? ` · #${post.seriesPosition}` : ""}`}
          </Chip>
        ) : null}
        {post.voiceScore ? (
          <Badge
            variant={post.voiceScore >= 8 ? "success" : post.voiceScore >= 5 ? "warning" : "flagged"}
            className="hidden shrink-0 sm:inline-flex"
          >
            {post.voiceScore}
          </Badge>
        ) : null}
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform", expanded && "rotate-90")} />
      </div>
      {expanded ? (
        <div className="border-t border-hairline bg-paper-sunk px-4 pb-4 pt-0">
          {post.status === "failed" && post.failureReason ? (
            <div className="mb-3 mt-3 rounded-[10px] border-2 border-ink bg-p-coral p-3 text-[12.5px] text-ink">
              <span className="font-medium">Failed: </span>
              {post.failureReason}
            </div>
          ) : null}
          {post.status === "scheduled" ? (
            <p className="mb-2 mt-3 text-[11px] text-ink-2">
              This post is scheduled. Moving it back to your inbox will cancel the scheduled publish.
            </p>
          ) : null}
          {post.status === "publishing" ? (
            <p className="mb-2 mt-3 text-[11px] font-medium text-ink">
              This post is currently being published. Moving it back may not prevent it from posting.
            </p>
          ) : null}
          <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{post.contentSnapshot}</p>
          <div className="flex flex-wrap items-center gap-2">
            {post.status === "published" && post.linkedinPostId ? (
              <a
                href={`https://www.linkedin.com/feed/update/${post.linkedinPostId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLink className="h-3 w-3" />
                View on LinkedIn
              </a>
            ) : null}
            {post.status === "failed" ? <RetryButton postId={post.id} /> : null}
            {["scheduled", "publishing", "failed"].includes(post.status) ? (
              <MoveToInboxButton postId={post.id} onSuccess={() => onMoveSuccess(post.id)} />
            ) : null}
            {post.status === "scheduled" ? (
              <RescheduleButton
                postId={post.id}
                currentScheduledAt={post.scheduledAt}
                onSuccess={() => onMoveSuccess()}
              />
            ) : null}
            {post.status === "published" ? <ManualMetrics post={post} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  async function loadPosts() {
    const response = await fetch("/api/posts");
    const data = await response.json();
    setPosts(data.posts ?? []);
  }

  useEffect(() => {
    void loadPosts();
  }, []);

  function handleMoveSuccess(postId?: string) {
    if (!postId) {
      void loadPosts();
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  const counts = useMemo(
    () => ({
      all: posts.length,
      scheduled: posts.filter((post) => post.status === "scheduled").length,
      published: posts.filter((post) => post.status === "published").length,
      failed: posts.filter((post) => post.status === "failed").length,
    }),
    [posts],
  );

  const filteredPosts = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((post) => post.status === filter);
  }, [filter, posts]);

  return (
    <div className="overflow-x-hidden">
      <PageHeader title="History" description="All scheduled and published posts" />
      <div className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-[10px] bg-paper-sunk p-1">
        {[
          { key: "all", label: "All" },
          { key: "scheduled", label: "Scheduled" },
          { key: "published", label: "Published" },
          { key: "failed", label: "Failed" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as FilterKey)}
            className={cn(
              "inline-flex h-8 items-center rounded-md border-2 px-3 text-[13px] font-medium transition-colors",
              filter === tab.key ? "border-ink bg-p-blue text-ink shadow-xs" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
            {counts[tab.key as FilterKey] > 0 ? (
              <Chip tone={tab.key === "failed" ? "coral" : "neutral"} size="sm" className="ml-1.5">
                {counts[tab.key as FilterKey]}
              </Chip>
            ) : null}
          </button>
        ))}
      </div>

      <div className="w-full overflow-hidden rounded-[10px] border-2 border-ink bg-surface">
        {filteredPosts.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          filteredPosts.map((post, i) => (
            <PostRow
              key={post.id}
              post={post}
              isLast={i === filteredPosts.length - 1}
              onMoveSuccess={handleMoveSuccess}
            />
          ))
        )}
      </div>
    </div>
  );
}
