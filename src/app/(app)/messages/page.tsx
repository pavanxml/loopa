"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { api, ApiClientError } from "@/lib/apiClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, useApi } from "@/components/data";
import { useToast } from "@/components/Toast";
import { uploadMedia } from "@/lib/uploadClient";
import { Icon } from "@/components/Icon";

interface Participant {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}
interface Conversation {
  id: string;
  isGroup: number;
  title: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  participants: Participant[];
}
interface Message {
  id: string;
  body: string | null;
  kind: string;
  createdAt: string;
  deleted?: boolean;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  replyToBody?: string | null;
  reactions?: { emoji: string; username: string }[];
  mediaUrl?: string | null;
}

export default function MessagesPage() {
  const { show } = useToast();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newChatUser, setNewChatUser] = useState("");
  const { data: me } = useApi<{ id: string; username: string }>("/api/auth/me");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("conversation");
    if (id) setActiveId(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useApi<{ items: Conversation[] }>(
    `/api/conversations${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`,
    [debounced],
  );

  async function startChat() {
    const username = newChatUser.trim().replace(/^@/, "");
    if (!username) return;
    try {
      const res = await api.post<{ id: string }>("/api/conversations", {
        participantUsernames: [username],
      });
      setNewChatUser("");
      setActiveId(res.id);
      reload();
    } catch (err) {
      show(
        err instanceof ApiClientError
          ? err.error.message
          : "Couldn't start that conversation.",
        "error",
      );
    }
  }

  const active = data?.items.find((c) => c.id === activeId) ?? null;

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl gap-4 px-4 py-6 md:h-screen">
      <div
        className={`flex w-full flex-col md:w-80 ${activeId ? "hidden md:flex" : "flex"}`}
      >
        <PageHeader title="Whispers" subtitle="Just you and your people." />
        <div className="mb-3 flex gap-2">
          <input
            className="input"
            placeholder="@username"
            value={newChatUser}
            onChange={(e) => setNewChatUser(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startChat()}
            aria-label="Start a conversation"
          />
          <button
            className="btn-secondary shrink-0"
            onClick={startChat}
            disabled={!newChatUser.trim()}
          >
            New
          </button>
        </div>
        <input
          className="input mb-3"
          type="search"
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search conversations"
        />

        <AsyncBoundary loading={loading} error={error} onRetry={reload}>
          {data?.items.length === 0 ? (
            <EmptyState
              icon="✉"
              title="No conversations yet"
              description="Start one with a @username above."
            />
          ) : (
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {data?.items.map((c) => {
                const other = c.participants[0];
                const title = c.title ?? other?.displayName ?? "Conversation";
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                      activeId === c.id
                        ? "bg-loop-50 dark:bg-white/10"
                        : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <Avatar
                      src={other?.avatarUrl ?? null}
                      name={title}
                      size={38}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{title}</p>
                      <p className="truncate text-xs text-[rgb(var(--text-muted))]">
                        {c.lastMessage ?? "No messages yet"}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-loop-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </AsyncBoundary>
      </div>

      <div className={`flex-1 ${activeId ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <Thread
            conversation={active}
            onBack={() => setActiveId(null)}
            onSent={reload}
            me={me}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon="✉"
              title="Pick a conversation"
              description="Or start a new one."
            />
          </div>
        )}
      </div>
    </main>
  );
}

function Thread({
  conversation,
  onBack,
  onSent,
  me,
}: {
  conversation: Conversation;
  onBack: () => void;
  onSent: () => void;
  me: { id: string; username: string } | null;
}) {
  const { show } = useToast();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false),
    [reply, setReply] = useState<Message | null>(null),
    [seen, setSeen] = useState(false),
    [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setSeen(false);
    setReply(null);
    setLoadError("");
    api
      .get<{ items: Message[] }>(
        `/api/conversations/${conversation.id}/messages`,
      )
      .then((r) => {
        if (!cancelled)
          setMessages((previous) => {
            const items = new Map(r.items.map((m) => [m.id, m]));
            for (const m of previous ?? []) items.set(m.id, m);
            return Array.from(items.values());
          });
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setLoadError(
            "Could not load this conversation. Select it again to retry.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  // Real server push via SSE — the server writes when something happens.
  // No polling interval anywhere in this component.
  useEffect(() => {
    const source = new EventSource(
      `/api/conversations/${conversation.id}/stream`,
    );
    let cancelled = false;
    source.onopen = () => {
      setConnected(true);
      // Catch up after an interrupted connection; SSE itself has no durable replay log.
      void api
        .get<{ items: Message[] }>(
          `/api/conversations/${conversation.id}/messages`,
        )
        .then((result) => {
          if (cancelled) return;
          setMessages((previous) => {
            const items = new Map((previous ?? []).map((m) => [m.id, m]));
            for (const m of result.items) items.set(m.id, m);
            return Array.from(items.values()).sort(
              (a, b) =>
                a.createdAt.localeCompare(b.createdAt) ||
                a.id.localeCompare(b.id),
            );
          });
        })
        .catch(() => {});
    };
    source.onerror = () => {
      setConnected(false);
      void api.get("/api/auth/me").catch(() => {});
    };
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "connected") setConnected(true);
        if (event.type === "message") {
          if (document.visibilityState === "visible")
            void api
              .patch(`/api/conversations/${conversation.id}/read`)
              .catch(() => {});
          setMessages((prev) => {
            if (!prev) return [event.payload];
            if (prev.some((m) => m.id === event.payload.id)) return prev; // our own echo
            return [...prev, event.payload];
          });
          onSent();
        }
        if (event.type === "typing") {
          if (event.userId !== me?.id) setTypingUser(event.username);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
        }
        if (event.type === "read" && event.userId !== me?.id) setSeen(true);
        if (event.type === "deleted")
          setMessages(
            (previous) =>
              previous?.map((m) =>
                m.id === event.messageId
                  ? { ...m, deleted: true, body: null, mediaUrl: null }
                  : m,
              ) ?? null,
          );
      } catch {
        /* malformed frame */
      }
    };
    return () => {
      cancelled = true;
      source.close();
      clearTimeout(typingTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const lastTypingSent = useRef(0);
  function onDraftChange(value: string) {
    setDraft(value);
    // Throttle the typing signal — one ping per 2s, not one per keystroke.
    if (Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now();
      api.post(`/api/conversations/${conversation.id}/typing`).catch(() => {});
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      const msg = await api.post<Message>(
        `/api/conversations/${conversation.id}/messages`,
        { body: draft, replyToId: reply?.id },
      );
      setReply(null);
      setSeen(false);
      setDraft("");
      setMessages((prev) =>
        prev?.some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg],
      );
      onSent();
    } catch (err) {
      show(
        err instanceof ApiClientError
          ? err.error.message
          : "Couldn't send message.",
        "error",
      );
    } finally {
      setSending(false);
    }
  }

  const other = conversation.participants[0];
  async function sendMedia(file: File) {
    setUploading(true);
    try {
      const media = await uploadMedia(file);
      const msg = await api.post<Message>(
        `/api/conversations/${conversation.id}/messages`,
        { kind: media.kind, mediaUrl: media.url },
      );
      setMessages((previous) =>
        previous?.some((m) => m.id === msg.id)
          ? previous
          : [...(previous ?? []), msg],
      );
      setSeen(false);
      onSent();
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Could not send media",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }
  async function deleteMessage(id: string) {
    try {
      await api.delete(
        `/api/conversations/${conversation.id}/messages?messageId=${id}`,
      );
      setMessages(
        (previous) =>
          previous?.map((m) =>
            m.id === id
              ? { ...m, deleted: true, body: null, mediaUrl: null }
              : m,
          ) ?? null,
      );
    } catch {
      show("Could not delete message", "error");
    }
  }
  const title = conversation.title ?? other?.displayName ?? "Conversation";
  const online = other?.lastSeenAt
    ? Date.now() - new Date(other.lastSeenAt).getTime() < 60_000
    : false;

  return (
    <div className="card flex w-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[rgb(var(--border))] p-3.5">
        <button
          className="btn-ghost h-8 w-8 p-0 md:hidden"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>
        <Avatar src={other?.avatarUrl ?? null} name={title} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-[rgb(var(--text-muted))]">
            {typingUser
              ? `${typingUser} is typing…`
              : online
                ? "Online"
                : connected
                  ? "Connected"
                  : "Reconnecting…"}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages === null && (
          <p className="text-sm text-[rgb(var(--text-muted))]">
            Loading messages…
          </p>
        )}
        {loadError && (
          <p role="alert" className="text-sm text-red-500">
            {loadError}
          </p>
        )}
        {messages?.length === 0 && (
          <p className="my-auto text-center text-sm text-[rgb(var(--text-muted))]">
            No messages yet. Say something.
          </p>
        )}
        {messages?.map((m) => {
          const mine = m.senderUsername === me?.username;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine
                    ? "bg-loop-600 text-white"
                    : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {m.deleted ? (
                  <em className="opacity-60">Message deleted</em>
                ) : (
                  <>
                    {m.replyToBody && (
                      <blockquote className="mb-2 border-l-2 pl-2 text-xs opacity-70">
                        {m.replyToBody}
                      </blockquote>
                    )}
                    {m.mediaUrl &&
                      (m.kind === "video" ? (
                        <video
                          src={m.mediaUrl}
                          controls
                          playsInline
                          className="mb-2 max-h-64 rounded-lg"
                        />
                      ) : (
                        <img
                          src={m.mediaUrl}
                          alt="Shared photo"
                          className="mb-2 max-h-64 rounded-lg"
                        />
                      ))}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </>
                )}
                <p
                  className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-[rgb(var(--text-muted))]"}`}
                >
                  {formatDistanceToNow(
                    new Date(
                      m.createdAt.includes("T")
                        ? m.createdAt
                        : m.createdAt.replace(" ", "T") + "Z",
                    ),
                    { addSuffix: true },
                  )}
                </p>
                {!m.deleted && (
                  <div className="mt-1 flex gap-3 text-[10px] opacity-70">
                    <button onClick={() => setReply(m)}>Reply</button>
                    {mine && (
                      <button onClick={() => deleteMessage(m.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {seen && messages?.at(-1)?.senderUsername === me?.username && (
          <p className="text-right text-[10px] text-[rgb(var(--text-muted))]">
            Seen
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {reply && (
        <div className="flex items-center justify-between border-t p-3 text-xs">
          <p className="truncate">
            Replying to {reply.senderUsername}: {reply.body ?? "Media"}
          </p>
          <button onClick={() => setReply(null)} aria-label="Cancel reply">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <form
        onSubmit={send}
        className="flex gap-2 border-t border-[rgb(var(--border))] p-3"
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void sendMedia(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label="Attach photo or video"
          disabled={uploading || sending}
          onClick={() => fileInput.current?.click()}
          className="p-1"
        >
          {uploading ? "…" : <Icon name="image" size={22} />}
        </button>
        <input
          className="input"
          placeholder="Message…"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          maxLength={4000}
          aria-label="Message"
        />
        <button
          className="btn-primary shrink-0"
          disabled={sending || !draft.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
