"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "./ui";
import { Icon } from "./Icon";
import { api } from "@/lib/apiClient";
import { useToast } from "./Toast";
import type { FeedPost } from "@/types/feed";

export function PostCard({
  post,
  onHide,
}: {
  post: FeedPost;
  onHide?: (id: string) => void;
}) {
  const { show } = useToast();
  const [liked, setLiked] = useState(post.viewer.liked),
    [likes, setLikes] = useState(post.counts.likes),
    [saved, setSaved] = useState(post.viewer.saved);
  const [busy, setBusy] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [comments, setComments] = useState(false),
    [slide, setSlide] = useState(0),
    [commentCount, setCommentCount] = useState(post.counts.comments);
  useEffect(() => {
    setLiked(post.viewer.liked);
    setLikes(post.counts.likes);
    setSaved(post.viewer.saved);
    setCommentCount(post.counts.comments);
  }, [post]);
  async function toggleLike() {
    if (busy) return;
    setBusy("like");
    const before = liked;
    setLiked(!before);
    setLikes((n) => Math.max(0, n + (before ? -1 : 1)));
    try {
      const result = await api.post<{ liked: boolean }>(
        `/api/posts/${post.id}/like`,
      );
      setLiked(result.liked);
    } catch {
      setLiked(before);
      setLikes((n) => Math.max(0, n + (before ? 1 : -1)));
      show("Could not update like", "error");
    } finally {
      setBusy(null);
    }
  }
  async function toggleSave() {
    if (busy) return;
    setBusy("save");
    try {
      const result = await api.post<{ saved: boolean }>(
        `/api/posts/${post.id}/save`,
      );
      setSaved(result.saved);
      show(result.saved ? "Saved" : "Removed from saved", "success");
    } catch {
      show("Could not save post", "error");
    } finally {
      setBusy(null);
    }
  }
  async function share() {
    const url = `${location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        show("Link copied", "success");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        show("Could not share this post", "error");
    }
  }
  async function action(kind: "hide" | "delete" | "report") {
    setMenu(false);
    if (kind === "delete" && !confirm("Delete this post?")) return;
    try {
      if (kind === "delete") await api.delete(`/api/posts/${post.id}`);
      else if (kind === "hide")
        await api.patch(`/api/posts/${post.id}`, { hidden: true });
      else await api.post("/api/reports", { postId: post.id, reason: "spam" });
      if (kind !== "report") onHide?.(post.id);
      show(
        kind === "report"
          ? "Report submitted"
          : kind === "delete"
            ? "Post deleted"
            : "Post hidden",
        "success",
      );
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Could not complete action",
        "error",
      );
    }
  }
  const media = post.media[slide];
  return (
    <article className="mb-5 border-b pb-5">
      <header className="relative flex items-center gap-3 py-3">
        <Link href={`/profile/${post.author.username}`}>
          <Avatar
            src={post.author.avatarUrl}
            name={post.author.displayName}
            size={34}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/profile/${post.author.username}`}
              className="truncate font-semibold"
            >
              {post.author.username}
            </Link>
            <span className="shrink-0 text-xs text-[rgb(var(--text-muted))]">
              · {formatDistanceToNow(new Date(post.createdAt))}
            </span>
          </div>
          {post.location && <p className="text-xs">{post.location}</p>}
        </div>
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Post options"
          aria-expanded={menu}
          className="rounded-lg p-2"
        >
          <Icon name="more" size={21} />
        </button>
        {menu && (
          <div className="absolute right-0 top-14 z-20 w-48 rounded-xl border bg-[rgb(var(--card))] p-2 shadow-popover">
            <button
              onClick={() => action("hide")}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5"
            >
              Hide post
            </button>
            {post.viewer.isOwner ? (
              <button
                onClick={() => action("delete")}
                className="block w-full px-3 py-2 text-left text-sm text-red-500"
              >
                Delete post
              </button>
            ) : (
              <button
                onClick={() => action("report")}
                className="block w-full px-3 py-2 text-left text-sm text-red-500"
              >
                Report post
              </button>
            )}
          </div>
        )}
      </header>
      {media ? (
        <div
          className="relative overflow-hidden rounded border bg-black"
          onDoubleClick={() => {
            if (!liked) void toggleLike();
          }}
        >
          {media.kind === "video" ? (
            <video
              key={media.url}
              src={media.url}
              poster={media.thumbnailUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="max-h-[640px] min-h-[280px] w-full object-contain"
            />
          ) : (
            <img
              src={media.url}
              alt={
                post.body?.slice(0, 120) || `Photo by ${post.author.username}`
              }
              loading="lazy"
              className="max-h-[640px] min-h-[280px] w-full object-contain"
            />
          )}
          {post.media.length > 1 && (
            <>
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
                {slide + 1}/{post.media.length}
              </span>
              {slide > 0 && (
                <button
                  onClick={() => setSlide((i) => i - 1)}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 rounded-full bg-white/90 p-1 text-black"
                >
                  <Icon name="arrow" size={18} className="rotate-180" />
                </button>
              )}
              {slide < post.media.length - 1 && (
                <button
                  onClick={() => setSlide((i) => i + 1)}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 rounded-full bg-white/90 p-1 text-black"
                >
                  <Icon name="arrow" size={18} />
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-[rgb(var(--bg-subtle))] px-1 py-6">
          <p className="whitespace-pre-wrap text-lg leading-relaxed">
            {post.body}
          </p>
        </div>
      )}
      <div className="flex items-center gap-4 py-3">
        <button
          onClick={toggleLike}
          disabled={!!busy}
          aria-label={liked ? "Unlike post" : "Like post"}
          aria-pressed={liked}
          className={liked ? "text-rose-500" : "hover:opacity-60"}
        >
          <Icon name="heart" filled={liked} size={26} />
        </button>
        <button
          onClick={() => setComments((v) => !v)}
          aria-label="Comments"
          aria-expanded={comments}
        >
          <Icon name="comment" size={26} />
        </button>
        <button onClick={share} aria-label="Share post">
          <Icon name="message" size={25} />
        </button>
        {post.media.length > 1 && (
          <div className="mx-auto flex gap-1">
            {post.media.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Show photo ${i + 1}`}
                className={`h-1.5 w-1.5 rounded-full ${i === slide ? "bg-loop-600" : "bg-zinc-300"}`}
              />
            ))}
          </div>
        )}
        <button
          onClick={toggleSave}
          disabled={!!busy}
          aria-label={saved ? "Unsave post" : "Save post"}
          aria-pressed={saved}
          className="ml-auto"
        >
          <Icon name="bookmark" size={25} filled={saved} />
        </button>
      </div>
      <p className="text-sm font-semibold">
        {likes.toLocaleString()} {likes === 1 ? "like" : "likes"}
      </p>
      {!!post.media.length && post.body && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
          <Link
            href={`/profile/${post.author.username}`}
            className="mr-2 font-semibold"
          >
            {post.author.username}
          </Link>
          {post.body}
        </p>
      )}
      <button
        onClick={() => setComments((v) => !v)}
        className="mt-2 text-sm text-[rgb(var(--text-muted))]"
      >
        {commentCount ? `View ${commentCount} comments` : "Add a comment…"}
      </button>
      {comments && (
        <CommentThread
          postId={post.id}
          onAdded={() => setCommentCount((n) => n + 1)}
        />
      )}
    </article>
  );
}
interface Comment {
  id: string;
  body: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
}
function CommentThread({
  postId,
  onAdded,
}: {
  postId: string;
  onAdded: () => void;
}) {
  const { show } = useToast();
  const [items, setItems] = useState<Comment[] | null>(null),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api
      .get<{ items: Comment[] }>(`/api/posts/${postId}/comments`)
      .then((r) => {
        setItems(r.items);
        setError("");
      })
      .catch(() => setError("Could not load comments."));
  useEffect(() => {
    void load();
  }, [postId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/posts/${postId}/comments`, { body: draft });
      setDraft("");
      onAdded();
      await load();
    } catch (err) {
      show(
        err instanceof Error ? err.message : "Could not post comment",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="mt-4 border-t pt-3" aria-label="Comments">
      {error ? (
        <button onClick={load} className="text-sm text-red-500">
          {error} Retry
        </button>
      ) : items === null ? (
        <p className="text-xs">Loading comments…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[rgb(var(--text-muted))]">
          Start the conversation.
        </p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {items.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar
                src={c.authorAvatarUrl}
                name={c.authorDisplayName}
                size={26}
              />
              <p className="whitespace-pre-wrap text-sm">
                <Link
                  className="mr-2 font-semibold"
                  href={`/profile/${c.authorUsername}`}
                >
                  {c.authorUsername}
                </Link>
                {c.body}
              </p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          aria-label="Comment"
          className="input"
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
        />
        <button
          className="text-sm font-semibold text-loop-600 disabled:opacity-40"
          disabled={saving || !draft.trim()}
        >
          {saving ? "Posting…" : "Post"}
        </button>
      </form>
    </section>
  );
}
