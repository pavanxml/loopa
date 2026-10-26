"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { AsyncBoundary, useApi } from "@/components/data";
import { Avatar, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MediaGrid } from "@/components/MediaGrid";
import type { FeedPost } from "@/types/feed";
type Person = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string;
};
type Results = {
  users?: Person[];
  posts?: { id: string; body: string; authorUsername: string }[];
  hashtags?: { tag: string }[];
};
export default function DiscoverPage() {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Results | null>(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [tab, setTab] = useState("discover"),
    [more, setMore] = useState(false);
  const generation = useRef(0);
  const { data, error, loading, reload, setData } = useApi<{
    items: FeedPost[];
    nextCursor: string | null;
  }>("/api/feed?mode=explore&limit=30");
  const { data: people } = useApi<{ items: Person[] }>(
    "/api/discover?tab=people",
  );
  useEffect(() => {
    const current = ++generation.current;
    setSearchError("");
    if (!query.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<{ results: Results }>(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
        )
        .then((r) => {
          if (current === generation.current) setResults(r.results);
        })
        .catch(() => {
          if (current === generation.current)
            setSearchError("Could not search. Please try again.");
        })
        .finally(() => {
          if (current === generation.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  async function loadMore() {
    if (!data?.nextCursor) return;
    setMore(true);
    try {
      const next = await api.get<typeof data>(
        `/api/feed?mode=explore&limit=30&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      setData({
        items: [...data.items, ...next.items],
        nextCursor: next.nextCursor,
      });
    } catch {
      setSearchError("Could not load more. Please try again.");
    } finally {
      setMore(false);
    }
  }
  return (
    <main className="mx-auto max-w-[980px] px-4 py-8">
      <header className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Radar</h1>
          <p className="mt-1 text-sm text-[rgb(var(--text-muted))]">
            Find your people. Get a little sidetracked.
          </p>
        </div>
        <div className="relative sm:w-80">
          <Icon
            name="search"
            size={18}
            className="absolute left-3 top-3 text-[rgb(var(--text-muted))]"
          />
          <input
            aria-label="Search Radar"
            type="search"
            className="input pl-10"
            placeholder="People, ideas, #rabbitHoles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>
      {query.trim() ? (
        <section aria-live="polite">
          {searching ? (
            <p className="py-8 text-center text-sm">Scanning the radar…</p>
          ) : searchError ? (
            <p role="alert" className="text-sm text-red-500">
              {searchError}
            </p>
          ) : (
            results && (
              <>
                {!!results.users?.length && (
                  <div className="mb-6 grid gap-3 sm:grid-cols-2">
                    {results.users.map((person) => (
                      <PersonRow key={person.username} person={person} />
                    ))}
                  </div>
                )}
                {!!results.hashtags?.length && (
                  <div className="mb-6 flex flex-wrap gap-2">
                    {results.hashtags.map((topic) => (
                      <Link
                        key={topic.tag}
                        href={`/topics/${topic.tag}`}
                        className="rounded-full border px-4 py-2 text-sm"
                      >
                        #{topic.tag}
                      </Link>
                    ))}
                  </div>
                )}
                {!!results.posts?.length && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {results.posts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        className="rounded-xl border p-4"
                      >
                        <p className="mb-2 text-xs font-semibold">
                          @{post.authorUsername}
                        </p>
                        <p className="line-clamp-3 text-sm">{post.body}</p>
                      </Link>
                    ))}
                  </div>
                )}
                {!results.users?.length &&
                  !results.posts?.length &&
                  !results.hashtags?.length && (
                    <EmptyState
                      icon={<Icon name="search" size={40} />}
                      title="No signal yet"
                      description="Try another name, word, or hashtag."
                    />
                  )}
              </>
            )
          )}
        </section>
      ) : (
        <>
          <div className="mb-5 flex gap-5 border-b">
            <button
              onClick={() => setTab("discover")}
              className={`border-b-2 py-3 text-sm ${tab === "discover" ? "border-current font-semibold" : "border-transparent text-[rgb(var(--text-muted))]"}`}
            >
              On your radar
            </button>
            <button
              onClick={() => setTab("people")}
              className={`border-b-2 py-3 text-sm ${tab === "people" ? "border-current font-semibold" : "border-transparent text-[rgb(var(--text-muted))]"}`}
            >
              New faces
            </button>
          </div>
          {tab === "people" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {people?.items.map((person) => (
                <PersonRow key={person.username} person={person} />
              ))}
            </div>
          ) : (
            <AsyncBoundary loading={loading} error={error} onRetry={reload}>
              {data?.items.length ? (
                <>
                  <MediaGrid posts={data.items} />
                  {data.nextCursor && (
                    <button
                      disabled={more}
                      onClick={loadMore}
                      className="btn-secondary mx-auto mt-8 flex"
                    >
                      {more ? "Loading…" : "Keep exploring"}
                    </button>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<Icon name="compass" size={44} />}
                  title="Uncharted territory"
                  description="Photo and video drops will appear here as people share them."
                  action={
                    <Link href="/create" className="btn-primary">
                      Make a drop
                    </Link>
                  }
                />
              )}
            </AsyncBoundary>
          )}
        </>
      )}
    </main>
  );
}
function PersonRow({ person }: { person: Person }) {
  return (
    <Link
      href={`/profile/${person.username}`}
      className="flex items-center gap-3 rounded-xl border p-4"
    >
      <Avatar src={person.avatarUrl} name={person.displayName} size={44} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{person.username}</p>
        <p className="truncate text-xs text-[rgb(var(--text-muted))]">
          {person.displayName}
        </p>
      </div>
      <Icon name="arrow" size={16} className="ml-auto" />
    </Link>
  );
}
