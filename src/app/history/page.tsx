"use client";

import { useEffect, useState } from "react";

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
};

function RetryButton({ postId }: { postId: string }) {
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Retry failed");
      } else {
        setDone(true);
        // Refresh the page to show updated status
        window.location.reload();
      }
    } catch {
      setError("Network error - try again");
    } finally {
      setRetrying(false);
    }
  };

  if (done) {
    return <span className="text-xs font-medium text-green-600">Published ✓</span>;
  }

  return (
    <div>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {retrying ? "Retrying..." : "Retry"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function PostMetricsInput({ post }: { post: Post }) {
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
    <div className="mt-3 border-t border-slate-100 pt-3">
      {hasMetrics && !open ? (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {post.manualImpressions ? <span>👁 {post.manualImpressions.toLocaleString()} impressions</span> : null}
          {post.manualReactions ? <span>👍 {post.manualReactions} reactions</span> : null}
          {post.manualComments ? <span>💬 {post.manualComments} comments</span> : null}
          <button onClick={() => setOpen(true)} className="ml-auto text-blue-500 hover:text-blue-700">
            Edit
          </button>
        </div>
      ) : null}

      {!hasMetrics && !open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-slate-400 transition-colors hover:text-slate-600">
          + Add performance data
          <span className="ml-1 text-slate-300">(manual from LinkedIn)</span>
        </button>
      ) : null}

      {open ? (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-slate-400">Enter from LinkedIn analytics - not required</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-500">Impressions</label>
              <input
                type="number"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-500">Reactions</label>
              <input
                type="number"
                value={reactions}
                onChange={(e) => setReactions(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-500">Comments</label>
              <input
                type="number"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    fetch("/api/posts").then((r) => r.json()).then((d) => setPosts(d.posts ?? []));
  }, []);

  const published = posts.filter((post) => post.status === "published");
  const failed = posts.filter((post) => post.status === "failed");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">History</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Published</h2>
        <div className="space-y-3">
          {published.map((post) => (
            <div key={post.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-sm leading-relaxed text-slate-800">{post.contentSnapshot}</p>
                </div>
                <div className="flex-shrink-0 space-y-1 text-right">
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Published</span>
                  <p className="text-xs text-slate-400">{new Date(post.publishedAt ?? post.scheduledAt).toLocaleString()}</p>
                </div>
              </div>
              <PostMetricsInput post={post} />
            </div>
          ))}
          {published.length === 0 ? <p className="text-sm text-slate-500">No published posts yet.</p> : null}
        </div>
      </div>

      {failed.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Failed</h2>
          <div className="space-y-3">
            {failed.map((post) => (
              <div key={post.id} className="rounded-xl border border-red-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 line-clamp-3 text-sm leading-relaxed text-slate-800">{post.contentSnapshot}</p>
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{post.failureReason}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <RetryButton postId={post.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
