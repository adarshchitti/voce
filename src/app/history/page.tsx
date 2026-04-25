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
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">History</h1>
      {posts.map((post) => (
        <div key={post.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <p className="line-clamp-2">{post.contentSnapshot}</p>
          <p className="mt-2">Status: {post.status}</p>
          <p>Scheduled: {new Date(post.scheduledAt).toLocaleString()}</p>
          {post.publishedAt ? <p>Published: {new Date(post.publishedAt).toLocaleString()}</p> : null}
          {post.failureReason ? <p className="text-red-600">{post.failureReason}</p> : null}
        </div>
      ))}
    </div>
  );
}
