"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/apiClient";
import { EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface EventItem {
  id: string; title: string; description: string | null; category: string | null;
  mode: string; location: string | null; startAt: string; capacity: number | null;
  attendeeCount: number; hostUsername: string; hostDisplayName: string;
  communitySlug: string | null; communityName: string | null; isAttending: boolean;
}

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "popular", label: "Popular" },
  { id: "recommended", label: "For you" },
  { id: "community", label: "My communities" },
  { id: "nearby", label: "Nearby" },
];

export default function EventsPage() {
  const { show } = useToast();
  const [scope, setScope] = useState("upcoming");
  const { data, error, loading, reload } = useApi<{ items: EventItem[]; note?: string }>(
    `/api/events?scope=${scope}`, [scope]
  );

  async function toggleAttend(ev: EventItem) {
    try {
      const res = await api.post<{ attending: boolean }>(`/api/events/${ev.id}/attend`);
      show(res.attending ? `You're going to ${ev.title}` : "Removed from your events", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update attendance.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Events" subtitle="Things worth showing up for."
        action={<Link href="/events/new" className="btn-primary shrink-0">Host</Link>} />
      <Tabs tabs={TABS} active={scope} onChange={setScope} />

      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState icon="▤" title="No events here yet"
            description={data.note ?? "When events are scheduled, they'll show up here."}
            action={<Link href="/events/new" className="btn-secondary">Host an event</Link>} />
        ) : (
          <div className="flex flex-col gap-2">
            {data?.items.map((ev) => {
              const full = ev.capacity !== null && ev.attendeeCount >= ev.capacity;
              return (
                <div key={ev.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/events/${ev.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ev.title}</p>
                      <p className="mt-0.5 text-xs text-[rgb(var(--text-muted))]">
                        {new Date(ev.startAt).toLocaleString(undefined, {
                          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[rgb(var(--text-muted))]">
                        {ev.mode === "online" ? "Online" : ev.location}
                        {ev.communityName ? ` · ${ev.communityName}` : ` · hosted by ${ev.hostDisplayName}`}
                      </p>
                    </Link>
                    <button
                      className={ev.isAttending ? "btn-ghost shrink-0 border border-[rgb(var(--border))]" : "btn-secondary shrink-0"}
                      onClick={() => toggleAttend(ev)}
                      disabled={!ev.isAttending && full}
                    >
                      {ev.isAttending ? "Going" : full ? "Full" : "Join"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
                    {ev.attendeeCount} going{ev.capacity ? ` of ${ev.capacity}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}
