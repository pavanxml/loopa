"use client";
import { useParams } from "next/navigation";

import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface TopicFeed {
  tag: string; useCount: number; followerCount: number; isFollowing: boolean;
  posts: { id: string; body: string; createdAt: string; likeCount: number; commentCount: number;
           authorUsername: string; authorDisplayName: string; authorAvatarUrl: string | null }[];
}

export default function TopicPage() {
  const params = useParams<{ tag: string }>();
  const { tag } = params;
  const { show } = useToast();
  const { data, error, loading, reload } = useApi<TopicFeed>(`/api/topics/${tag}`);

  async function toggleFollow() {
    try {
      const res = await api.post<{ following: boolean }>(`/api/topics/${tag}`);
      show(res.following ? `Following #${tag}` : `Unfollowed #${tag}`, "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data && (
          <>
            <PageHeader
              title={`#${data.tag}`}
              subtitle={`${data.useCount} posts · ${data.followerCount} followers`}
              action={<button className={data.isFollowing ? "btn-ghost shrink-0 border border-[rgb(var(--border))]" : "btn-primary shrink-0"}
                onClick={toggleFollow}>{data.isFollowing ? "Following" : "Follow topic"}</button>}
            />
            {data.posts.length === 0 ? (
              <EmptyState icon="✦" title="No posts yet" description={`Be the first to post with #${data.tag}.`} />
            ) : (
              <div className="flex flex-col gap-2">
                {data.posts.map((p) => (
                  <article key={p.id} className="card p-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={p.authorAvatarUrl} name={p.authorDisplayName} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.authorDisplayName}</p>
                        <p className="truncate text-xs text-[rgb(var(--text-muted))]">@{p.authorUsername}</p>
                      </div>
                    </div>
                    <p className="mt-2.5 whitespace-pre-wrap text-sm">{p.body}</p>
                    <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
                      {p.likeCount} likes · {p.commentCount} comments
                    </p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </main>
  );
}
