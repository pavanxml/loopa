"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar } from "@/components/ui";
import { AsyncBoundary, PageHeader, Tabs, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";

interface Me {
  username: string; displayName: string; email: string; emailVerifiedAt: string | null; role: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { show } = useToast();
  const [tab, setTab] = useState("account");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const { data, error, loading, reload } = useApi<Me>("/api/auth/me");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("loopa-theme", next); } catch { /* storage unavailable */ }
  }

  async function logout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  async function deactivate() {
    if (!confirm("Deactivate your account? You can reactivate by logging in again.")) return;
    try {
      await api.patch("/api/account", { action: "deactivate" });
      router.push("/login");
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't deactivate.", "error");
    }
  }

  async function deleteAccount() {
    if (!confirm("Permanently delete your account? This cannot be undone.")) return;
    if (!confirm("Really delete? Your posts will be anonymized and you'll be logged out.")) return;
    try {
      await api.patch("/api/account", { action: "delete" });
      router.push("/");
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't delete account.", "error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title="Settings" />
      <Tabs tabs={[
        { id: "account", label: "Account" },
        { id: "privacy", label: "Privacy" },
        { id: "notifications", label: "Notifications" },
        { id: "appearance", label: "Appearance" },
        { id: "safety", label: "Blocked & muted" },
      ]} active={tab} onChange={setTab} />

      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {tab === "account" && data && (
          <div className="flex flex-col gap-4">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold">Account</h2>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><dt className="text-[rgb(var(--text-muted))]">Username</dt><dd>@{data.username}</dd></div>
                <div className="flex justify-between"><dt className="text-[rgb(var(--text-muted))]">Email</dt><dd>{data.email}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-[rgb(var(--text-muted))]">Email verified</dt>
                  <dd>{data.emailVerifiedAt ? "Yes" : "Not yet"}</dd>
                </div>
                {data.role !== "user" && (
                  <div className="flex justify-between"><dt className="text-[rgb(var(--text-muted))]">Role</dt><dd className="font-semibold text-loop-600">{data.role}</dd></div>
                )}
              </dl>
              <button className="btn-secondary mt-4" onClick={logout}>Log out</button>
            </div>

            <div className="card border-red-500/30 p-5">
              <h2 className="mb-1 text-sm font-semibold text-red-500">Danger zone</h2>
              <p className="mb-3 text-xs text-[rgb(var(--text-muted))]">
                Deactivating hides your profile and can be undone by logging back in. Deleting is permanent.
              </p>
              <div className="flex gap-2">
                <button className="btn-ghost border border-[rgb(var(--border))]" onClick={deactivate}>Deactivate</button>
                <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={deleteAccount}>Delete account</button>
              </div>
            </div>
          </div>
        )}

        {tab === "privacy" && data && <PrivacySettings username={data.username} />}
        {tab === "notifications" && <NotificationPreferences />}
        {tab === "appearance" && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Appearance</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm">Dark mode</span>
              <button role="switch" aria-checked={theme === "dark"} onClick={toggleTheme}
                className={`relative h-6 w-11 rounded-full transition-colors ${theme === "dark" ? "bg-loop-600" : "bg-black/20"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  theme === "dark" ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        )}
        {tab === "safety" && <SafetyLists />}
      </AsyncBoundary>
    </main>
  );
}

function PrivacySettings({ username }: { username: string }) {
  const { show } = useToast();
  const [form, setForm] = useState({
    dmPolicy: "everyone", followPolicy: "open", commentPolicy: "everyone", mentionPolicy: "everyone",
  });
  const [saving, setSaving] = useState(false);
  useEffect(()=>{let active=true;api.get<typeof form>(`/api/users/${username}`).then(saved=>{if(active)setForm({dmPolicy:saved.dmPolicy,followPolicy:saved.followPolicy,commentPolicy:saved.commentPolicy,mentionPolicy:saved.mentionPolicy});}).catch(()=>show("Could not load privacy preferences","error"));return()=>{active=false;};},[username]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/users/${username}`, form);
      show("Privacy settings updated", "success");
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  }

  const ROWS = [
    { key: "dmPolicy" as const, label: "Who can message you", options: [["everyone", "Everyone"], ["followers", "People you follow"], ["none", "No one"]] },
    { key: "followPolicy" as const, label: "Who can follow you", options: [["open", "Anyone"], ["approval_required", "Approve each request"]] },
    { key: "commentPolicy" as const, label: "Who can comment", options: [["everyone", "Everyone"], ["followers", "Followers"], ["none", "No one"]] },
    { key: "mentionPolicy" as const, label: "Who can mention you", options: [["everyone", "Everyone"], ["followers", "Followers"], ["none", "No one"]] },
  ];

  return (
    <div className="card flex flex-col gap-4 p-5">
      <h2 className="text-sm font-semibold">Privacy</h2>
      {ROWS.map((row) => (
        <div key={row.key}>
          <label htmlFor={row.key} className="mb-1 block text-xs font-medium">{row.label}</label>
          <select id={row.key} className="input" value={form[row.key]}
            onChange={(e) => setForm({ ...form, [row.key]: e.target.value })}>
            {row.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      <button className="btn-primary self-end" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save privacy settings"}
      </button>
    </div>
  );
}

function NotificationPreferences() {
  const { show } = useToast();
  const { data, error, loading, reload } = useApi<Record<string, number>>("/api/notifications/preferences");

  async function toggle(key: string, current: number) {
    try {
      await api.patch("/api/notifications/preferences", { [key]: current === 0 });
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't save.", "error");
    }
  }

  const ROWS: [string, string][] = [
    ["likes", "Likes"], ["comments", "Comments"], ["follows", "New followers"],
    ["connection_request", "Connection requests"], ["messages", "Messages"],
    ["mentions", "Mentions"], ["community_activity", "Community activity"],
    ["event_reminder", "Event updates"], ["invitation", "Invitations"],
  ];

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload}>
      <div className="card flex flex-col gap-1 p-5">
        <h2 className="mb-2 text-sm font-semibold">Notify me about</h2>
        {ROWS.map(([key, label]) => {
          const on = data?.[key] !== 0;
          return (
            <div key={key} className="flex items-center justify-between py-2">
              <span className="text-sm">{label}</span>
              <button role="switch" aria-checked={on} onClick={() => toggle(key, data?.[key] ?? 1)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-loop-600" : "bg-black/20"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
        <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
          Moderation notices about your own account can&apos;t be turned off.
        </p>
      </div>
    </AsyncBoundary>
  );
}

function SafetyLists() {
  const { show } = useToast();
  const { data, error, loading, reload } = useApi<{
    blocked: { username: string; displayName: string; avatarUrl: string | null }[];
    muted: { username: string; displayName: string; avatarUrl: string | null }[];
  }>("/api/safety");

  async function undo(action: "unblock" | "unmute", username: string) {
    try {
      await api.post("/api/safety", { action, username });
      show(action === "unblock" ? "Unblocked" : "Unmuted", "success");
      reload();
    } catch (err) {
      show(err instanceof ApiClientError ? err.error.message : "Couldn't update.", "error");
    }
  }

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload}>
      <div className="flex flex-col gap-4">
        {(["blocked", "muted"] as const).map((key) => (
          <div key={key} className="card p-5">
            <h2 className="mb-3 text-sm font-semibold capitalize">{key}</h2>
            {data?.[key].length === 0 ? (
              <p className="text-sm text-[rgb(var(--text-muted))]">No one {key} yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data?.[key].map((u) => (
                  <div key={u.username} className="flex items-center gap-3">
                    <Avatar src={u.avatarUrl} name={u.displayName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.displayName}</p>
                      <p className="truncate text-xs text-[rgb(var(--text-muted))]">@{u.username}</p>
                    </div>
                    <button className="btn-ghost border border-[rgb(var(--border))] text-xs"
                      onClick={() => undo(key === "blocked" ? "unblock" : "unmute", u.username)}>
                      {key === "blocked" ? "Unblock" : "Unmute"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </AsyncBoundary>
  );
}
