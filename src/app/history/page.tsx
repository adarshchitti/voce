"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight, Clock, ExternalLink, FileText, Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
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
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0FDF4]">
        <CheckCircle className="h-3.5 w-3.5 text-[#16A34A]" />
      </div>
    );
  }
  if (status === "scheduled") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF]">
        <Clock className="h-3.5 w-3.5 text-[#2563EB]" />
      </div>
    );
  }
  if (status === "publishing") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF]">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FEF2F2]">
        <XCircle className="h-3.5 w-3.5 text-[#DC2626]" />
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
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#DC2626] px-3 text-[12px] text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
    >
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
    </button>
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
        <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
          {post.manualImpressions ? <span>Impressions: {post.manualImpressions.toLocaleString()}</span> : null}
          {post.manualReactions ? <span>Reactions: {post.manualReactions}</span> : null}
          {post.manualComments ? <span>Comments: {post.manualComments}</span> : null}
          <button onClick={() => setOpen(true)} className="ml-auto text-[#2563EB] hover:underline">
            Edit
          </button>
        </div>
      ) : null}

      {!hasMetrics && !open ? (
        <button onClick={() => setOpen(true)} className="text-[11px] text-[#9CA3AF] transition-colors hover:text-[#6B7280]">
          + Add manual metrics
        </button>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-md border border-[#E5E7EB] bg-white p-2.5">
          <div className="flex gap-2">
            <div className="min-w-[110px] flex-1">
              <input
                type="number"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="0"
                className="h-7 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
            <div className="min-w-[90px] flex-1">
              <input
                type="number"
                value={reactions}
                onChange={(e) => setReactions(e.target.value)}
                placeholder="0"
                className="h-7 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
            <div className="min-w-[90px] flex-1">
              <input
                type="number"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="0"
                className="h-7 w-full rounded-md border border-[#E5E7EB] px-2 text-[12px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-0.5">
            <button onClick={() => setOpen(false)} className="px-2 py-1 text-[11px] text-[#6B7280] hover:text-[#374151]">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-7 rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[11px] font-medium text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
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
      <Icon className="mb-3 h-8 w-8 text-[#D1D5DB]" />
      <p className="text-[13.5px] font-medium text-[#374151]">{title}</p>
      <p className="mt-0.5 max-w-xs text-[12px] text-[#9CA3AF]">{desc}</p>
    </div>
  );
}

function PostRow({ post, isLast }: { post: Post; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = post.contentSnapshot.split("\n")[0] ?? "";
  return (
    <div className={cn("transition-colors hover:bg-[#FAFAFA]", !isLast && "border-b border-[#F3F4F6]")}>
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded((prev) => !prev)}>
        <StatusIcon status={post.status} />
        <div className="w-28 shrink-0">
          <p className="text-[12.5px] font-medium text-[#374151]">{format(new Date(post.scheduledAt), "MMM d, yyyy")}</p>
          <p className="text-[11px] text-[#9CA3AF]">{format(new Date(post.scheduledAt), "h:mm a")}</p>
        </div>
        <p className="flex-1 truncate text-[13px] text-[#374151]">{firstLine}</p>
        {post.seriesId ? (
          <span className="hidden shrink-0 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] text-[#6B7280] md:block">
            {post.seriesTitle?.slice(0, 20) ?? "Project"}
            {post.seriesPosition ? ` · #${post.seriesPosition}` : ""}
          </span>
        ) : null}
        {post.voiceScore ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
              post.voiceScore >= 8 && "bg-[#F0FDF4] text-[#16A34A]",
              post.voiceScore >= 5 && post.voiceScore < 8 && "bg-[#FFFBEB] text-[#D97706]",
              post.voiceScore < 5 && "bg-[#FEF2F2] text-[#DC2626]",
            )}
          >
            {post.voiceScore}
          </span>
        ) : null}
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-[#9CA3AF] transition-transform", expanded && "rotate-90")} />
      </div>
      {expanded ? (
        <div className="border-t border-[#F3F4F6] bg-[#FAFAFA] px-4 pb-4 pt-0">
          {post.status === "failed" && post.failureReason ? (
            <div className="mb-3 mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12.5px] text-[#DC2626]">
              <span className="font-medium">Failed: </span>
              {post.failureReason}
            </div>
          ) : null}
          <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[#374151]">{post.contentSnapshot}</p>
          <div className="flex flex-wrap items-center gap-2">
            {post.status === "published" && post.linkedinPostId ? (
              <a
                href={`https://www.linkedin.com/feed/update/${post.linkedinPostId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#E5E7EB] px-3 text-[12px] text-[#0077B5] transition-colors hover:bg-[#EFF6FF]"
              >
                <ExternalLink className="h-3 w-3" />
                View on LinkedIn
              </a>
            ) : null}
            {post.status === "failed" ? <RetryButton postId={post.id} /> : null}
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
  useEffect(() => {
    fetch("/api/posts").then((r) => r.json()).then((d) => setPosts(d.posts ?? []));
  }, []);

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
    <div>
      <PageHeader title="History" description="All scheduled and published posts" />
      <div className="mb-5 flex gap-1 border-b border-[#E5E7EB] pb-0">
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
              "border-b-2 -mb-px px-3 py-2 text-[13px] font-medium transition-colors",
              filter === tab.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-[#6B7280] hover:text-[#374151]",
            )}
          >
            {tab.label}
            {counts[tab.key as FilterKey] > 0 ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]",
                  tab.key === "failed" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#F3F4F6] text-[#6B7280]",
                )}
              >
                {counts[tab.key as FilterKey]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
        {filteredPosts.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          filteredPosts.map((post, i) => <PostRow key={post.id} post={post} isLast={i === filteredPosts.length - 1} />)
        )}
      </div>
    </div>
  );
}
