"use client";

import { useState } from "react";
import { api, ApiClientError } from "@/lib/apiClient";
import { EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

/**
 * Admin dashboard. Access is enforced server-side by requirePlatformAdmin()
 * on every /api/admin/* route — a non-admin who navigates here sees the
 * access-denied state because the API refuses, not because the UI hides it.
 */
export default function AdminPage() {
  const [tab, setTab] = useState("overview");
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader title="Admin" subtitle="Platform operations and moderation." />
      <Tabs tabs={[
        { id: "overview", label: "Overview" },
        { id: "reports", label: "Reports" },
        { id: "users", label: "Users" },
      ]} active={tab} onChange={setTab} />
      {tab === "overview" && <Overview />}
      {tab === "reports" && <Reports />}
      {tab === "users" && <Users />}
    </main>
  );
}

function AccessDenied() {
  return <EmptyState icon="🔒" title="Admin access required"
    description="Your account doesn't have permission to view this dashboard." />;
}

function Overview() {
  const { data, error, loading, reload } = useApi<{ stats: Record<string, Record<string, number | boolean | string>> }>(
    "/api/admin/overview"
  );
  if (error?.includes("Admin access")) return <AccessDenied />;

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload}>
      <div className="flex flex-col gap-5">
        {data && Object.entries(data.stats).map(([section, values]) => (
          <section key={section}>
            <h2 className="mb-2 text-sm font-semibold capitalize">{section.replace(/([A-Z])/g, " $1")}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(values).map(([k, v]) => (
                <div key={k} className="card p-3.5">
                  <p className="text-xs capitalize text-[rgb(var(--text-muted))]">{k.replace(/([A-Z])/g, " $1")}</p>
                  <p className="mt-0.5 text-lg font-bold">
                    {typeof v === "boolean" ? (v ? "OK" : "Down") : typeof v === "string" ? new Date(v).toLocaleTimeString() : v}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AsyncBoundary>
  );
}

interface Report {
  id: string; reason: string; details: string | null; createdAt: string;
  reporterUsername: string; reportedUsername: string | null;
  postBody: string | null; commentBody: string | null;
  postId: string | null; commentId: string | null; reportedUserId: string | null;
}

function Reports() {
  const { show } = useToast();
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useApi<{ items: Report[] }>(
    `/api/admin/reports?status=${status}`, [status]
  );
  if (error?.includes("Admin access")) return <AccessDenied />;

  async function resolve(reportId: string, action: string) {
    try {
      await api.patch("/api/admin/reports", { reportId, action });
      show(`Report ${action === "dismiss" ? "dismissed" : "actioned"}`, "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't resolve report.", "error");
    }
  }

  return (
    <>
      <div className="mb-4 flex gap-1.5">
        {["pending", "actioned", "dismissed"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
              status === s ? "bg-loop-600 text-white" : "bg-black/5 dark:bg-white/5"}`}>
            {s}
          </button>
        ))}
      </div>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <EmptyState icon="✓" title="Queue is clear" description={`No ${status} reports right now.`} />
        ) : (
          <div className="flex flex-col gap-2">
            {data?.items.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold capitalize">{r.reason.replace("_", " ")}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))]">
                      by @{r.reporterUsername}
                      {r.reportedUsername ? ` · against @${r.reportedUsername}` : ""}
                      {" · "}{new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {(r.postBody || r.commentBody) && (
                  <blockquote className="mt-2.5 rounded-lg bg-black/5 p-2.5 text-sm dark:bg-white/5">
                    {r.postBody ?? r.commentBody}
                  </blockquote>
                )}
                {r.details && <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">Note: {r.details}</p>}
                {status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-ghost border border-[rgb(var(--border))] text-xs"
                      onClick={() => resolve(r.id, "dismiss")}>Dismiss</button>
                    {(r.postId || r.commentId) && (
                      <button className="btn-secondary text-xs" onClick={() => resolve(r.id, "remove_content")}>
                        Remove content
                      </button>
                    )}
                    {r.reportedUserId && (
                      <button className="btn bg-red-600 text-xs text-white hover:bg-red-700"
                        onClick={() => resolve(r.id, "suspend_user")}>Suspend user</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}

interface AdminUser {
  id: string; username: string; displayName: string; email: string;
  role: string; status: string; postCount: number; reportCount: number; createdAt: string;
}

function Users() {
  const { show } = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const { data, error, loading, reload } = useApi<{ items: AdminUser[] }>(
    `/api/admin/users?q=${encodeURIComponent(debounced)}`, [debounced]
  );
  if (error?.includes("Admin access")) return <AccessDenied />;

  async function act(userId: string, action: "suspend" | "reinstate") {
    try {
      await api.patch("/api/admin/users", { userId, action });
      show(action === "suspend" ? "User suspended" : "User reinstated", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update user.", "error");
    }
  }

  return (
    <>
      <input className="input mb-4" type="search" placeholder="Search users…" value={q}
        onChange={(e) => { setQ(e.target.value); setTimeout(() => setDebounced(e.target.value.trim()), 300); }}
        aria-label="Search users" />
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        <div className="flex flex-col gap-2">
          {data?.items.map((u) => (
            <div key={u.id} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {u.displayName}
                  {u.role !== "user" && <span className="ml-1.5 text-xs font-bold text-loop-600">{u.role}</span>}
                </p>
                <p className="truncate text-xs text-[rgb(var(--text-muted))]">
                  @{u.username} · {u.postCount} posts
                  {u.reportCount > 0 && <span className="text-red-500"> · {u.reportCount} reports</span>}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                u.status === "active" ? "bg-teal-500/15 text-teal-600" : "bg-red-500/15 text-red-500"}`}>
                {u.status}
              </span>
              {u.role !== "admin" && (
                <button className="btn-ghost shrink-0 border border-[rgb(var(--border))] text-xs"
                  onClick={() => act(u.id, u.status === "suspended" ? "reinstate" : "suspend")}>
                  {u.status === "suspended" ? "Reinstate" : "Suspend"}
                </button>
              )}
            </div>
          ))}
        </div>
      </AsyncBoundary>
    </>
  );
}
