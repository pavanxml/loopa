"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface ConnectionRow {
  id: string; username: string; displayName: string; avatarUrl: string | null; createdAt: string;
}

export default function ConnectionsPage() {
  const { show } = useToast();
  const [box, setBox] = useState("incoming");
  const { data, error, loading, reload } = useApi<{ items: ConnectionRow[] }>(
    `/api/connections?box=${box}`, [box]
  );

  async function respond(id: string, action: "accept" | "decline") {
    try {
      await api.patch(`/api/connections/${id}`, { action });
      show(action === "accept" ? "Connected" : "Declined", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update request.", "error");
    }
  }

  async function withdraw(id: string) {
    try {
      await api.delete(`/api/connections/${id}`);
      show("Removed", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't remove.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Connections" subtitle="Mutual connections, separate from following." />
      <Tabs tabs={[
        { id: "incoming", label: "Requests" },
        { id: "outgoing", label: "Sent" },
        { id: "accepted", label: "Connected" },
      ]} active={box} onChange={setBox} />

      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState icon="◒" title="Nothing here"
            description={box === "incoming" ? "Requests people send you will show up here." : "Nothing to show yet."} />
        ) : (
          <div className="flex flex-col gap-2">
            {data?.items.map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-3.5">
                <Avatar src={c.avatarUrl} name={c.displayName} size={38} />
                <Link href={`/profile/${c.username}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.displayName}</p>
                  <p className="truncate text-xs text-[rgb(var(--text-muted))]">@{c.username}</p>
                </Link>
                {box === "incoming" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button className="btn-secondary text-xs" onClick={() => respond(c.id, "accept")}>Accept</button>
                    <button className="btn-ghost border border-[rgb(var(--border))] text-xs" onClick={() => respond(c.id, "decline")}>Decline</button>
                  </div>
                )}
                {box !== "incoming" && (
                  <button className="btn-ghost shrink-0 border border-[rgb(var(--border))] text-xs" onClick={() => withdraw(c.id)}>
                    {box === "outgoing" ? "Withdraw" : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </main>
  );
}
