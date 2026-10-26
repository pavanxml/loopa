"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";
import { useState } from "react";

interface Notification {
  id: string; type: string; entityType: string | null; entityId: string | null;
  readAt: string | null; createdAt: string;
  actorUsername: string | null; actorDisplayName: string | null; actorAvatarUrl: string | null;
}

const COPY: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "started following you",
  follow_request: "wants to follow you",
  connection_request: "sent you a connection request",
  message: "sent you a message",
  mention: "mentioned you",
  community_activity: "updated your role in a community",
  event_reminder: "updated an event you're attending",
  invitation: "invited you",
  moderation_action: "took a moderation action on your account",
};

export default function NotificationsPage() {
  const{show}=useToast();
  const { data, error, loading, reload } = useApi<{ items: Notification[]; unreadCount: number }>(
    "/api/notifications?limit=50"
  );

  async function markAll() {
    try{await api.patch("/api/notifications", { markAll: true });reload();}catch{show("Could not mark updates read","error");}
  }

  function href(n: Notification): string {
    if (n.entityType === "post" && n.entityId) return `/post/${n.entityId}`;
    if (n.entityType === "event" && n.entityId) return `/events/${n.entityId}`;
    if (n.entityType === "message") return "/messages";
    if (n.actorUsername) return `/profile/${n.actorUsername}`;
    return "/notifications";
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader
        title="Echoes"
        subtitle={data?.unreadCount ? `${data.unreadCount} unread` : undefined}
        action={data && data.unreadCount > 0
          ? <button className="btn-secondary shrink-0" onClick={markAll}>Mark all read</button>
          : undefined}
      />
      <FollowRequests/>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState icon="◔" title="Nothing new" description="Likes, comments, and follows will show up here." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data?.items.map((n) => (
              <Link key={n.id} href={href(n)} onClick={()=>{void api.patch("/api/notifications",{id:n.id}).catch(()=>{});}}
                className={`card flex items-center gap-3 p-3.5 ${!n.readAt ? "border-loop-200 bg-loop-50/40 dark:border-loop-800 dark:bg-white/[0.04]" : ""}`}>
                <Avatar src={n.actorAvatarUrl} name={n.actorDisplayName ?? "LOOPA"} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{n.actorDisplayName ?? "LOOPA"}</span>{" "}
                    <span className="text-[rgb(var(--text-muted))]">{COPY[n.type] ?? "sent you an update"}</span>
                  </p>
                  <p className="text-xs text-[rgb(var(--text-muted))]">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-loop-600" aria-label="Unread" />}
              </Link>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}

function FollowRequests(){
  const{data,reload}=useApi<{items:{id:string;username:string;displayName:string;avatarUrl:string|null}[]}>("/api/follow-requests");const{show}=useToast();const[busy,setBusy]=useState<string|null>(null);
  async function respond(id:string,action:"accept"|"decline"){setBusy(id);try{await api.patch("/api/follow-requests",{id,action});reload();}catch(err){show(err instanceof Error?err.message:"Could not update request","error");}finally{setBusy(null);}}
  if(!data?.items.length)return null;
  return <section className="mb-6 rounded-xl border p-4"><h2 className="mb-4 text-sm font-semibold">Requests to enter your Orbit</h2>{data.items.map(person=><div key={person.id} className="mb-3 flex flex-wrap items-center gap-3"><Avatar src={person.avatarUrl} name={person.displayName} size={32}/><Link className="mr-auto text-sm font-semibold" href={`/profile/${person.username}`}>{person.username}</Link><button disabled={busy===person.id} onClick={()=>respond(person.id,"accept")} className="btn-primary px-3 py-1.5 text-xs">Accept</button><button disabled={busy===person.id} onClick={()=>respond(person.id,"decline")} className="btn-secondary px-3 py-1.5 text-xs">Decline</button></div>)}</section>;
}
