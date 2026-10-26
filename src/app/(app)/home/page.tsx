"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { PostCard } from "@/components/PostCard";
import {
  Avatar,
  EmptyState,
  ErrorState,
  PostCardSkeleton,
} from "@/components/ui";
import { Stories } from "@/components/Stories";
import { Icon } from "@/components/Icon";
import { useApi } from "@/components/data";
import type { FeedPost } from "@/types/feed";
export default function HomePage() {
  const [mode, setMode] = useState("for_you"),
    [posts, setPosts] = useState<FeedPost[] | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(
    async (after?: string) => {
      const current = after ? generation.current : ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<{
          items: FeedPost[];
          nextCursor: string | null;
        }>(
          `/api/feed?mode=${mode}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`,
        );
        if (current !== generation.current) return;
        setPosts((previous) =>
          after
            ? [
                ...(previous ?? []),
                ...data.items.filter(
                  (p) => !previous?.some((x) => x.id === p.id),
                ),
              ]
            : data.items,
        );
        setCursor(data.nextCursor);
      } catch (err) {
        if (current === generation.current)
          setError(
            err instanceof Error ? err.message : "Could not load your feed.",
          );
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [mode],
  );
  useEffect(() => {
    setPosts(null);
    void load();
  }, [load]);
  return (
    <div className="mx-auto flex max-w-[1040px] justify-center gap-16 px-4 pb-8 pt-3 lg:pt-8">
      <main className="w-full min-w-0 max-w-[520px]">
        <header className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-6">
            <Link
              href="/home"
              className="mr-2 text-2xl font-bold italic tracking-tighter md:hidden"
            >
              loopa.
            </Link>
            {[
              ["for_you", "Your mix"],
              ["following", "Your people"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMode(id!)}
                aria-pressed={mode === id}
                className={`py-2 text-sm ${mode === id ? "font-bold" : "text-[rgb(var(--text-muted))]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-5 md:hidden">
            <Link href="/notifications" aria-label="Notifications">
              <Icon name="heart" />
            </Link>
            <Link href="/messages" aria-label="Messages">
              <Icon name="message" />
            </Link>
          </div>
        </header>
        <Stories />
        {posts === null && !error && (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        )}
        {error && <ErrorState message={error} onRetry={() => load()} />}
        {posts?.length === 0 && (
          <EmptyState
            icon={<Icon name="camera" size={48} />}
            title={
              mode === "following"
                ? "Your people, right here"
                : "Make the first moment"
            }
            description={
              mode === "following"
                ? "Follow people to see their latest posts here."
                : "Share a photo, a video, or something on your mind."
            }
            action={
              <Link
                href={mode === "following" ? "/discover" : "/create"}
                className="btn-primary"
              >
                {mode === "following" ? "Find people" : "Create a post"}
              </Link>
            }
          />
        )}
        {posts?.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onHide={(id) =>
              setPosts(
                (previous) => previous?.filter((p) => p.id !== id) ?? null,
              )
            }
          />
        ))}
        {cursor && (
          <button
            onClick={() => load(cursor)}
            className="btn-secondary mx-auto mt-5 flex"
            disabled={loading}
          >
            {loading ? "Loading…" : "See more posts"}
          </button>
        )}
        {!!posts?.length && !cursor && (
          <p className="py-8 text-center text-xs text-[rgb(var(--text-muted))]">
            You’re all caught up.{" "}
            <button
              onClick={() => load()}
              className="font-semibold text-loop-600"
            >
              Refresh feed
            </button>
          </p>
        )}
      </main>
      <Suggestions />
    </div>
  );
}
function Suggestions() {
  const { data: me } = useApi<{
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>("/api/auth/me");
  const { data } = useApi<{
    items: {
      username: string;
      displayName: string;
      avatarUrl: string | null;
    }[];
  }>("/api/discover?tab=people");
  return (
    <aside className="hidden w-[280px] shrink-0 pt-5 lg:block">
      {me && (
        <Link
          href={`/profile/${me.username}`}
          className="mb-8 flex items-center gap-3"
        >
          <Avatar src={me.avatarUrl} name={me.displayName} size={48} />
          <div>
            <p className="text-sm font-semibold">{me.username}</p>
            <p className="text-sm text-[rgb(var(--text-muted))]">
              {me.displayName}
            </p>
          </div>
        </Link>
      )}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[rgb(var(--text-muted))]">
          Suggested for you
        </h2>
        <Link href="/discover" className="text-xs font-semibold">
          See all
        </Link>
      </div>
      {data?.items.slice(0, 5).map((person) => (
        <Link
          key={person.username}
          href={`/profile/${person.username}`}
          className="mb-4 flex items-center gap-3"
        >
          <Avatar src={person.avatarUrl} name={person.displayName} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{person.username}</p>
            <p className="text-xs text-[rgb(var(--text-muted))]">
              Suggested for you
            </p>
          </div>
          <span className="text-xs font-semibold text-loop-600">View</span>
        </Link>
      ))}
      {!data?.items.length && (
        <p className="text-xs text-[rgb(var(--text-muted))]">
          New people will appear as your community grows.
        </p>
      )}
      <div className="mt-10 flex flex-wrap gap-3 text-xs text-[rgb(var(--text-muted))]">
        <Link href="/communities">Communities</Link>
        <Link href="/events">Events</Link>
        <Link href="/settings">Settings</Link>
      </div>
      <p className="mt-5 text-[10px] uppercase tracking-wide text-[rgb(var(--text-muted))]">
        © {new Date().getFullYear()} Loopa
      </p>
    </aside>
  );
}
