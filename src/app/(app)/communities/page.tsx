"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/apiClient";
import { EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface Community {
  id: string; slug: string; name: string; description: string | null;
  iconUrl: string | null; privacy: string; memberCount: number; isMember: boolean;
}

export default function CommunitiesPage() {
  const { show } = useToast();
  const [tab, setTab] = useState("all");
  const { data, error, loading, reload } = useApi<{ items: Community[] }>(
    `/api/communities?${tab === "mine" ? "mine=true" : ""}`, [tab]
  );

  async function toggleJoin(c: Community) {
    try {
      if (c.isMember) {
        await api.delete(`/api/communities/${c.slug}/members`);
        show(`Left ${c.name}`, "success");
      } else {
        const res = await api.post<{ joined: boolean; pending: boolean }>(`/api/communities/${c.slug}/members`);
        show(res.pending ? "Request sent — a moderator will review it." : `Joined ${c.name}`, "success");
      }
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update membership.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader
        title="Communities"
        subtitle="Spaces built around shared interests."
        action={<Link href="/communities/new" className="btn-primary shrink-0">New</Link>}
      />
      <Tabs tabs={[{ id: "all", label: "Explore" }, { id: "mine", label: "My communities" }]} active={tab} onChange={setTab} />

      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState
            icon="◈"
            title={tab === "mine" ? "You haven't joined any yet" : "No communities yet"}
            description={tab === "mine" ? "Explore and join a few to see them here." : "Be the first to start one."}
            action={<Link href="/communities/new" className="btn-secondary">Create a community</Link>}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data?.items.map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-loop-400 to-teal-400 text-lg font-bold text-white">
                  {c.name[0]?.toUpperCase()}
                </div>
                <Link href={`/communities/${c.slug}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-[rgb(var(--text-muted))]">
                    {c.memberCount} members{c.privacy !== "public" ? ` · ${c.privacy.replace("_", "-")}` : ""}
                  </p>
                </Link>
                <button
                  className={c.isMember ? "btn-ghost shrink-0 border border-[rgb(var(--border))]" : "btn-secondary shrink-0"}
                  onClick={() => toggleJoin(c)}
                >
                  {c.isMember ? "Joined" : "Join"}
                </button>
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}
