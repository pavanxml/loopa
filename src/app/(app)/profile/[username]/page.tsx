"use client";
import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { uploadMedia } from "@/lib/uploadClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, useApi } from "@/components/data";
import { Icon } from "@/components/Icon";
import { MediaGrid } from "@/components/MediaGrid";
import { useToast } from "@/components/Toast";
import type { FeedPost } from "@/types/feed";
interface Profile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  skills: string | null;
  privacy: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isSelf: boolean;
  isFollowing: boolean;
  requested: boolean;
  canView: boolean;
}
export default function ProfilePage() {
  const { username } = useParams<{ username: string }>(),
    router = useRouter(),
    { show } = useToast();
  const { data, error, loading, reload } = useApi<Profile>(
    `/api/users/${username}`,
    [username],
  );
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState("drops"),
    [busy, setBusy] = useState(false),
    [list, setList] = useState<"followers" | "following" | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  async function follow() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.post<{ requested: boolean }>(
        `/api/users/${username}/follow`,
      );
      if (result.requested) show("Follow request sent", "success");
      reload();
    } catch (err) {
      show(err instanceof Error ? err.message : "Could not follow", "error");
    } finally {
      setBusy(false);
    }
  }
  async function message() {
    try {
      const result = await api.post<{ id: string }>("/api/conversations", {
        participantUsernames: [username],
      });
      router.push(`/messages?conversation=${result.id}`);
    } catch (err) {
      show(
        err instanceof Error ? err.message : "Could not open Whisper",
        "error",
      );
    }
  }
  async function avatar(file: File) {
    setBusy(true);
    try {
      const upload = await uploadMedia(file);
      if (upload.kind !== "image")
        throw new Error("Choose a photo for your avatar.");
      await api.patch(`/api/users/${username}`, { avatarUrl: upload.url });
      reload();
      show("Orbit photo updated", "success");
    } catch (err) {
      show(
        err instanceof Error ? err.message : "Could not change photo",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function block() {
    if (!confirm(`Block @${username}?`)) return;
    try {
      await api.post("/api/safety", { action: "block", username });
      router.push("/home");
      show("Account blocked", "success");
    } catch (err) {
      show(
        err instanceof Error ? err.message : "Could not block account",
        "error",
      );
    }
  }
  return (
    <main className="mx-auto max-w-[980px] px-4 py-8 sm:px-8">
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data && (
          <>
            <header className="mb-10 flex items-start gap-6 sm:gap-16 sm:px-8">
              <div className="shrink-0">
                <button
                  disabled={!data.isSelf || busy}
                  onClick={() => photo.current?.click()}
                  aria-label={
                    data.isSelf ? "Change Orbit photo" : "Profile photo"
                  }
                  className="rounded-full"
                >
                  <Avatar
                    src={data.avatarUrl}
                    name={data.displayName}
                    size={112}
                  />
                </button>
                <input
                  ref={photo}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void avatar(file);
                    e.target.value = "";
                  }}
                />
                {data.isSelf && (
                  <button
                    disabled={busy}
                    onClick={() => photo.current?.click()}
                    className="mt-2 block w-full text-xs font-semibold text-loop-600"
                  >
                    {busy ? "Working…" : "Change photo"}
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="mr-3 truncate text-xl font-normal">
                    {data.username}
                  </h1>
                  {data.isSelf ? (
                    <>
                      <button
                        className="btn-secondary rounded-lg py-1.5"
                        onClick={() => setEditing((v) => !v)}
                      >
                        {editing ? "Close editor" : "Edit Orbit"}
                      </button>
                      <Link
                        href="/settings"
                        className="rounded-lg border px-3 py-1.5 text-sm"
                      >
                        Settings
                      </Link>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        className={
                          data.isFollowing || data.requested
                            ? "btn-secondary rounded-lg"
                            : "btn-primary rounded-lg"
                        }
                        onClick={follow}
                      >
                        {data.isFollowing
                          ? "Following"
                          : data.requested
                            ? "Requested"
                            : "Follow"}
                      </button>
                      <button
                        className="btn-secondary rounded-lg"
                        onClick={message}
                      >
                        Whisper
                      </button>
                    </>
                  )}
                </div>
                <div className="my-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    <strong>{data.postCount}</strong> drops
                  </span>
                  <button onClick={() => setList("followers")}>
                    <strong>{data.followerCount}</strong> followers
                  </button>
                  <button onClick={() => setList("following")}>
                    <strong>{data.followingCount}</strong> following
                  </button>
                </div>
                <p className="text-sm font-semibold">{data.displayName}</p>
                {data.bio && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {data.bio}
                  </p>
                )}
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 block truncate text-sm font-semibold text-loop-600"
                  >
                    {data.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {data.location && (
                  <p className="mt-1 text-xs text-[rgb(var(--text-muted))]">
                    {data.location}
                  </p>
                )}
                {!data.isSelf && (
                  <button
                    onClick={block}
                    className="mt-3 text-xs text-[rgb(var(--text-muted))]"
                  >
                    Block account
                  </button>
                )}
              </div>
            </header>
            {editing && (
              <EditOrbit
                profile={data}
                onDone={() => {
                  setEditing(false);
                  reload();
                }}
              />
            )}
            <nav
              className="mb-1 flex justify-center gap-10 border-t"
              aria-label="Orbit content"
            >
              <button
                onClick={() => setTab("drops")}
                className={`flex items-center gap-2 border-t py-4 text-xs font-semibold uppercase tracking-widest ${tab === "drops" ? "border-current" : "border-transparent text-[rgb(var(--text-muted))]"}`}
              >
                <Icon name="grid" size={15} />
                Drops
              </button>
              <button
                onClick={() => setTab("flicks")}
                className={`flex items-center gap-2 border-t py-4 text-xs font-semibold uppercase tracking-widest ${tab === "flicks" ? "border-current" : "border-transparent text-[rgb(var(--text-muted))]"}`}
              >
                <Icon name="reels" size={15} />
                Flicks
              </button>
              {data.isSelf && (
                <Link
                  href="/saved"
                  className="flex items-center gap-2 py-4 text-xs font-semibold uppercase tracking-widest"
                >
                  <Icon name="bookmark" size={15} />
                  Stash
                </Link>
              )}
            </nav>
            {data.canView ? (
              <UserDrops key={username} username={username} tab={tab} />
            ) : (
              <EmptyState
                icon={<Icon name="profile" size={40} />}
                title="A private Orbit"
                description="Send a follow request to see their drops."
              />
            )}
            {list && (
              <PeopleList
                username={username}
                type={list}
                onClose={() => setList(null)}
              />
            )}
          </>
        )}
      </AsyncBoundary>
    </main>
  );
}
function UserDrops({ username, tab }: { username: string; tab: string }) {
  const { data, error, loading, reload, setData } = useApi<{
    items: FeedPost[];
    nextCursor: string | null;
  }>(`/api/users/${username}/posts?limit=30`);
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const posts =
    data?.items.filter(
      (p) => tab !== "flicks" || p.media.some((m) => m.kind === "video"),
    ) ?? [];
  async function more() {
    if (!data?.nextCursor) return;
    setBusy(true);
    try {
      const next = await api.get<typeof data>(
        `/api/users/${username}/posts?limit=30&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      setData({
        items: [...data.items, ...next.items],
        nextCursor: next.nextCursor,
      });
    } catch {
      show("Could not load more drops", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload}>
      {posts.length ? (
        <MediaGrid posts={posts} />
      ) : (
        <EmptyState
          icon={<Icon name={tab === "flicks" ? "reels" : "camera"} size={44} />}
          title={tab === "flicks" ? "No Flicks here yet" : "A fresh Orbit"}
          description="Shared moments will appear here."
        />
      )}
      {data?.nextCursor && (
        <button
          className="btn-secondary mx-auto mt-6 flex"
          disabled={busy}
          onClick={more}
        >
          {busy ? "Loading…" : "More drops"}
        </button>
      )}
    </AsyncBoundary>
  );
}
function EditOrbit({
  profile,
  onDone,
}: {
  profile: Profile;
  onDone: () => void;
}) {
  const { show } = useToast();
  const [form, setForm] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? "",
    website: profile.website ?? "",
    location: profile.location ?? "",
    privacy: profile.privacy,
  });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/api/users/${profile.username}`, form);
      show("Orbit updated", "success");
      onDone();
    } catch (err) {
      show(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="mb-8 rounded-xl border p-5">
      <h2 className="mb-4 font-semibold">Make this Orbit yours</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["displayName", "website", "location"] as const).map((key) => (
          <label key={key} className="text-xs font-medium">
            {key === "displayName"
              ? "Display name"
              : key === "website"
                ? "Website"
                : "Location"}
            <input
              className="input mt-1"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              maxLength={
                key === "displayName" ? 50 : key === "location" ? 80 : 200
              }
            />
          </label>
        ))}
        <label className="text-xs font-medium">
          Privacy
          <select
            className="input mt-1"
            value={form.privacy}
            onChange={(e) => setForm({ ...form, privacy: e.target.value })}
          >
            <option value="public">Public</option>
            <option value="private">Private · approve followers</option>
          </select>
        </label>
        <label className="text-xs font-medium sm:col-span-2">
          Bio
          <textarea
            className="input mt-1"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            maxLength={280}
          />
        </label>
      </div>
      <button className="btn-primary mt-4" disabled={busy}>
        {busy ? "Saving…" : "Save Orbit"}
      </button>
    </form>
  );
}
function PeopleList({
  username,
  type,
  onClose,
}: {
  username: string;
  type: string;
  onClose: () => void;
}) {
  const { data, error, loading, reload } = useApi<{
    items: {
      username: string;
      displayName: string;
      avatarUrl: string | null;
    }[];
  }>(`/api/users/${username}/followers?type=${type}`);
  return (
    <section className="mt-8 rounded-xl border p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold capitalize">{type}</h2>
        <button onClick={onClose} aria-label="Close people list">
          <Icon name="close" size={20} />
        </button>
      </div>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.items.length === 0 ? (
          <p className="text-sm text-[rgb(var(--text-muted))]">
            No people here yet.
          </p>
        ) : (
          data?.items.map((person) => (
            <Link
              href={`/profile/${person.username}`}
              key={person.username}
              className="mb-3 flex items-center gap-3"
              onClick={onClose}
            >
              <Avatar
                src={person.avatarUrl}
                name={person.displayName}
                size={34}
              />
              <span className="text-sm font-semibold">{person.username}</span>
            </Link>
          ))
        )}
      </AsyncBoundary>
    </section>
  );
}
