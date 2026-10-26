"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi, AsyncBoundary } from "@/components/data";
import { Avatar, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { FeedPost } from "@/types/feed";
export default function ReelsPage() {
  const { data, error, loading, reload, setData } = useApi<{
    items: FeedPost[];
    nextCursor: string | null;
  }>("/api/feed?mode=reels&limit=10");
  const [more, setMore] = useState(false);
  const { show } = useToast();
  async function loadMore() {
    if (!data?.nextCursor || more) return;
    setMore(true);
    try {
      const next = await api.get<typeof data>(
        `/api/feed?mode=reels&limit=10&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      setData({
        items: [...data.items, ...next.items],
        nextCursor: next.nextCursor,
      });
    } catch {
      show("Could not load more flicks", "error");
    } finally {
      setMore(false);
    }
  }
  return (
    <main
      className="h-[calc(100dvh-64px)] overflow-y-auto snap-y snap-mandatory md:h-screen"
      aria-label="Flicks"
    >
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState
            icon={<Icon name="reels" size={48} />}
            title="A little motion. A new perspective."
            description="Drop a video. Find your next obsession. Flicks from your community appear here."
            action={
              <Link href="/create" className="btn-primary">
                Share a video
              </Link>
            }
          />
        ) : (
          data?.items.map((post) => <Reel key={post.id} post={post} />)
        )}
        {data?.nextCursor && (
          <div className="flex snap-start justify-center p-6">
            <button className="btn-primary" disabled={more} onClick={loadMore}>
              {more ? "Loading…" : "More flicks"}
            </button>
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}
function Reel({ post }: { post: FeedPost }) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLElement>(null),
    [muted, setMuted] = useState(true),
    [liked, setLiked] = useState(post.viewer.liked),
    [likes, setLikes] = useState(post.counts.likes),
    [saved, setSaved] = useState(post.viewer.saved),
    [busy, setBusy] = useState(false);
  const { show } = useToast();
  const media = post.media.find((m) => m.kind === "video");
  useEffect(() => {
    const element = video.current,
      node = container.current;
    if (!element || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void element.play().catch(() => {});
        else element.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      element.pause();
    };
  }, []);
  async function like() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.post<{ liked: boolean }>(
        `/api/posts/${post.id}/like`,
      );
      setLiked(result.liked);
      setLikes((n) => n + (result.liked ? 1 : -1));
    } catch {
      show("Could not update like", "error");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      const result = await api.post<{ saved: boolean }>(
        `/api/posts/${post.id}/save`,
      );
      setSaved(result.saved);
    } catch {
      show("Could not save flick", "error");
    }
  }
  return (
    <section
      ref={container}
      className="flex min-h-[calc(100dvh-64px)] snap-start items-center justify-center gap-4 px-3 py-4 md:min-h-screen"
    >
      <div className="relative h-[calc(100dvh-100px)] max-h-[850px] w-full max-w-[450px] overflow-hidden rounded-xl bg-black text-white md:h-[calc(100dvh-40px)]">
        <video
          ref={video}
          src={media?.url}
          poster={media?.thumbnailUrl ?? undefined}
          muted={muted}
          playsInline
          loop
          controls
          preload="metadata"
          className="h-full w-full object-contain"
        />
        <button
          className="absolute right-4 top-4 rounded-full bg-black/40 p-2"
          aria-label={muted ? "Unmute flick" : "Mute flick"}
          onClick={() => setMuted((v) => !v)}
        >
          <Icon name={muted ? "mute" : "volume"} size={20} />
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-12 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-12">
          <Link
            className="pointer-events-auto mb-3 flex items-center gap-3"
            href={`/profile/${post.author.username}`}
          >
            <Avatar
              src={post.author.avatarUrl}
              name={post.author.displayName}
              size={32}
            />
            <span className="text-sm font-semibold">
              {post.author.username}
            </span>
          </Link>
          <p className="line-clamp-3 text-sm">{post.body}</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-6">
        <button
          disabled={busy}
          onClick={like}
          aria-label="Like flick"
          aria-pressed={liked}
          className={`flex flex-col items-center gap-1 text-xs ${liked ? "text-rose-500" : ""}`}
        >
          <Icon name="heart" filled={liked} size={29} />
          {likes}
        </button>
        <Link
          href={`/post/${post.id}`}
          aria-label="Flick comments"
          className="flex flex-col items-center gap-1 text-xs"
        >
          <Icon name="comment" size={28} />
          {post.counts.comments}
        </Link>
        <button aria-label="Save flick" aria-pressed={saved} onClick={save}>
          <Icon name="bookmark" filled={saved} size={27} />
        </button>
        <Link href={`/post/${post.id}`} aria-label="Open flick">
          <Icon name="more" />
        </Link>
      </div>
    </section>
  );
}
