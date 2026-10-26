"use client";
import { useParams } from "next/navigation";

import Link from "next/link";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar } from "@/components/ui";
import { AsyncBoundary, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface EventRecord {
  id: string; title: string; description: string | null; status: string;
  mode: string; location: string | null; startAt: string; capacity: number | null;
  attendeeCount: number; hostDisplayName: string;
  communitySlug: string | null; communityName: string | null;
}

interface Attendee {
  username: string; displayName: string; avatarUrl: string | null; status: string;
}

interface EventDetail {
  event: EventRecord;
  attendees: Attendee[];
  isAttending: boolean;
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;
  const { show } = useToast();
  const { data, error, loading, reload } = useApi<EventDetail>(`/api/events/${id}`);

  async function toggle() {
    try {
      const res = await api.post<{ attending: boolean }>(`/api/events/${id}/attend`);
      show(res.attending ? "You're going" : "Removed from your events", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update attendance.", "error");
    }
  }

  async function share() {
    try {
      const url = `${window.location.origin}/events/${id}`;
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard.writeText(url);
      show("Link copied", "success");
    } catch { /* cancelled */ }
  }

  const ev = data?.event;
  const cancelled = ev?.status === "cancelled";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {ev && (
          <>
            <div className="card mb-5 overflow-hidden">
              <div className="h-28 bg-gradient-to-br from-teal-400 to-loop-500" />
              <div className="p-5">
                {cancelled && (
                  <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500" role="alert">
                    This event has been cancelled.
                  </p>
                )}
                <h1 className="text-xl font-bold">{ev.title}</h1>
                <p className="mt-1.5 text-sm text-[rgb(var(--text-muted))]">
                  {new Date(ev.startAt).toLocaleString(undefined, {
                    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
                <p className="mt-0.5 text-sm text-[rgb(var(--text-muted))]">
                  {ev.mode === "online" ? "Online event" : (ev.location ?? "Location TBA")}
                </p>
                {ev.communityName ? (
                  <Link href={`/communities/${ev.communitySlug}`} className="mt-1 inline-block text-sm font-medium text-loop-600 hover:underline">
                    {ev.communityName}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm">Hosted by {ev.hostDisplayName}</p>
                )}
                {ev.description && <p className="mt-3 whitespace-pre-wrap text-sm">{ev.description}</p>}

                <div className="mt-4 flex gap-2">
                  <button className={data.isAttending ? "btn-ghost border border-[rgb(var(--border))]" : "btn-primary"}
                    onClick={toggle} disabled={cancelled}>
                    {data.isAttending ? "Going ✓" : "Join event"}
                  </button>
                  <button className="btn-secondary" onClick={share}>Share</button>
                </div>
                <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">
                  {ev.attendeeCount} going{ev.capacity ? ` · ${ev.capacity} capacity` : ""}
                </p>
              </div>
            </div>

            <h2 className="mb-2 text-sm font-semibold">Who&apos;s going</h2>
            <div className="card divide-y divide-[rgb(var(--border))]">
              {data.attendees.map((a) => (
                <Link key={a.username} href={`/profile/${a.username}`} className="flex items-center gap-3 p-3.5">
                  <Avatar src={a.avatarUrl} name={a.displayName} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{a.displayName}</p>
                    <p className="truncate text-xs text-[rgb(var(--text-muted))]">@{a.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </AsyncBoundary>
    </main>
  );
}
