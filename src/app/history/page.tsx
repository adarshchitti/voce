"use client";

import { useEffect, useState } from "react";

type Post = {
  id: string;
  status: string;
  contentSnapshot: string;
  scheduledAt: string;
  publishedAt: string | null;
  failureReason: string | null;
};

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
                    <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700" disabled>
                      Retry
                    </button>
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
