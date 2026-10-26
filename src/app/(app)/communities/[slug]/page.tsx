"use client";
import { useParams } from "next/navigation";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface CommunityDetail {
  id: string; slug: string; name: string; description: string | null; rules: string | null;
  privacy: string; memberCount: number; viewerRole: string | null; canView: boolean;
  posts: Record<string, unknown>[];
  members: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

export default function CommunityDetailPage() {
  const params = useParams<{ slug: string }>();
  const { slug } = params;
  const { show } = useToast();
  const [tab, setTab] = useState("posts");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const { data, error, loading, reload } = useApi<CommunityDetail>(`/api/communities/${slug}`);

  const canModerate = data?.viewerRole === "owner" || data?.viewerRole === "admin" || data?.viewerRole === "moderator";

  async function toggleMembership() {
    if (!data) return;
    try {
      if (data.viewerRole) {
        await api.delete(`/api/communities/${slug}/members`);
        show("Left community", "success");
      } else {
        const res = await api.post<{ pending: boolean }>(`/api/communities/${slug}/members`);
        show(res.pending ? "Join request sent" : "Joined", "success");
      }
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update membership.", "error");
    }
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/communities/${slug}/posts`, { type: "text", body: draft, mediaUrls: [] });
      setDraft("");
      show("Posted to the community", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't post.", "error");
    } finally {
      setPosting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await api.patch(`/api/communities/${slug}/members`, { userId, role });
      show("Role updated", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't change role.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data && (
          <>
            <div className="card mb-5 overflow-hidden">
              <div className="h-24 bg-gradient-to-br from-loop-500 to-teal-400" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-bold">{data.name}</h1>
                    <p className="text-xs text-[rgb(var(--text-muted))]">
                      {data.memberCount} members · {data.privacy.replace("_", "-")}
                      {data.viewerRole ? ` · you're ${data.viewerRole}` : ""}
                    </p>
                  </div>
                  <button className={data.viewerRole ? "btn-ghost shrink-0 border border-[rgb(var(--border))]" : "btn-primary shrink-0"}
                    onClick={toggleMembership}
                    disabled={data.viewerRole === "owner"}>
                    {data.viewerRole === "owner" ? "Owner" : data.viewerRole ? "Leave" : "Join"}
                  </button>
                </div>
                {data.description && <p className="mt-3 text-sm">{data.description}</p>}
              </div>
            </div>

            {!data.canView ? (
              <EmptyState icon="🔒" title="This community is private"
                description="Join to see posts, members, and events." />
            ) : (
              <>
                <Tabs
                  tabs={[
                    { id: "posts", label: "Posts" },
                    { id: "members", label: "Members" },
                    { id: "events", label: "Events" },
                    { id: "about", label: "About" },
                  ]}
                  active={tab} onChange={setTab}
                />

                {tab === "posts" && (
                  <div className="flex flex-col gap-3">
                    {data.viewerRole && (
                      <form onSubmit={submitPost} className="card flex flex-col gap-3 p-4">
                        <textarea className="input min-h-[72px] resize-none" placeholder={`Post to ${data.name}…`}
                          value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={3000}
                          aria-label="Community post" />
                        <button className="btn-primary self-end" disabled={posting || !draft.trim()}>
                          {posting ? "Posting…" : "Post"}
                        </button>
                      </form>
                    )}
                    {data.posts.length === 0 ? (
                      <EmptyState icon="◈" title="No posts yet"
                        description={data.viewerRole ? "Start the conversation." : "Join to start the conversation."} />
                    ) : (
                      data.posts.map((p) => (
                        <article key={p.id as string} className="card p-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={p.authorAvatarUrl as string | null} name={p.authorDisplayName as string} size={32} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{p.authorDisplayName as string}</p>
                              <p className="text-xs text-[rgb(var(--text-muted))]">
                                {formatDistanceToNow(new Date(p.createdAt as string), { addSuffix: true })}
                              </p>
                            </div>
                            {(p.pinned as number) === 1 && (
                              <span className="ml-auto rounded-full bg-loop-50 px-2 py-0.5 text-[10px] font-semibold text-loop-700 dark:bg-white/10">PINNED</span>
                            )}
                          </div>
                          <p className="mt-2.5 whitespace-pre-wrap text-sm">{p.body as string}</p>
                          <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
                            {p.likeCount as number} likes · {p.commentCount as number} comments
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                )}

                {tab === "members" && (
                  <div className="flex flex-col gap-2">
                    {data.members.map((m) => (
                      <div key={m.userId as string} className="card flex items-center gap-3 p-3.5">
                        <Avatar src={m.avatarUrl as string | null} name={m.displayName as string} size={36} />
                        <Link href={`/profile/${m.username}`} className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{m.displayName as string}</p>
                          <p className="truncate text-xs text-[rgb(var(--text-muted))]">@{m.username as string} · {m.role as string}</p>
                        </Link>
                        {canModerate && (m.role as string) !== "owner" && (
                          <select
                            className="input w-auto py-1 text-xs"
                            value={m.role as string}
                            onChange={(e) => changeRole(m.userId as string, e.target.value)}
                            aria-label={`Role for ${m.username}`}
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tab === "events" && (
                  data.events.length === 0
                    ? <EmptyState icon="▤" title="No upcoming events" description="Community events will show here." />
                    : (
                      <div className="flex flex-col gap-2">
                        {data.events.map((e) => (
                          <Link key={e.id as string} href={`/events/${e.id}`} className="card p-4">
                            <p className="text-sm font-semibold">{e.title as string}</p>
                            <p className="mt-0.5 text-xs text-[rgb(var(--text-muted))]">
                              {new Date(e.startAt as string).toLocaleString()} · {e.attendeeCount as number} going
                            </p>
                          </Link>
                        ))}
                      </div>
                    )
                )}

                {tab === "about" && (
                  <div className="card p-4">
                    <h2 className="text-sm font-semibold">Rules</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--text-muted))]">
                      {data.rules || "This community hasn't set rules yet."}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </AsyncBoundary>
    </main>
  );
}
