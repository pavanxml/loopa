"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface Collection { id: string; name: string; itemCount: number }
interface SavedPost {
  id: string; body: string | null; createdAt: string; collectionId: string | null;
  likeCount: number; commentCount: number;
  authorUsername: string; authorDisplayName: string; authorAvatarUrl: string | null;
}

export default function SavedPage() {
  const { show } = useToast();
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useApi<{ collections: Collection[]; savedPosts: SavedPost[] }>(
    "/api/collections"
  );

  async function createCollection() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/collections", { name: newName.trim() });
      setNewName("");
      show("Collection created", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't create collection.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function moveToCollection(postId: string, collectionId: string | null) {
    try {
      await api.patch("/api/collections", { postId, collectionId });
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't move that.", "error");
    }
  }

  const posts = data?.savedPosts.filter((p) => !activeCollection || p.collectionId === activeCollection) ?? [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Stash" subtitle="Good finds. Kept for later." />

      <div className="card mb-5 flex gap-2 p-3">
        <input className="input" placeholder="New collection (Travel, Ideas…)" value={newName}
          onChange={(e) => setNewName(e.target.value)} maxLength={40}
          onKeyDown={(e) => e.key === "Enter" && createCollection()} aria-label="New collection name" />
        <button className="btn-secondary shrink-0" onClick={createCollection} disabled={creating || !newName.trim()}>
          Create
        </button>
      </div>

      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setActiveCollection(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
            activeCollection === null ? "bg-loop-600 text-white" : "bg-black/5 dark:bg-white/5"}`}>
          All saved
        </button>
        {data?.collections.map((c) => (
          <button key={c.id} onClick={() => setActiveCollection(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              activeCollection === c.id ? "bg-loop-600 text-white" : "bg-black/5 dark:bg-white/5"}`}>
            {c.name} <span className="opacity-60">{c.itemCount}</span>
          </button>
        ))}
      </div>

      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {posts.length === 0 ? (
          <EmptyState icon="◫" title="Nothing saved here"
            description="Tap the bookmark on any drop to keep it for later." />
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((p) => (
              <article key={p.id} className="card p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar src={p.authorAvatarUrl} name={p.authorDisplayName} size={30} />
                  <p className="text-sm font-semibold">{p.authorDisplayName}</p>
                </div>
                <Link href={`/post/${p.id}`} className="mt-2 block text-sm hover:underline"><span className="line-clamp-4">{p.body??"Open saved drop"}</span><span className="mt-2 block text-xs text-loop-600">Open drop →</span></Link>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[rgb(var(--text-muted))]">
                    {p.likeCount} likes · {p.commentCount} comments
                  </span>
                  {(data?.collections.length ?? 0) > 0 && (
                    <select
                      className="input w-auto py-1 text-xs"
                      value={p.collectionId ?? ""}
                      onChange={(e) => moveToCollection(p.id, e.target.value || null)}
                      aria-label="Move to collection"
                    >
                      <option value="">Uncategorized</option>
                      {data?.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}
