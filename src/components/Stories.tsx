"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "./ui";
import { Icon } from "./Icon";
import { useApi } from "./data";
import { api } from "@/lib/apiClient";
import { useToast } from "./Toast";
export interface StoryReel {
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  moments: {
    id: string;
    kind: string;
    mediaUrl: string | null;
    text: string | null;
    createdAt: string;
    expiresAt: string;
    reactionCount: number;
  }[];
}
export function Stories() {
  const { data, error, reload } = useApi<{ reels: StoryReel[] }>(
    "/api/moments",
  );
  const [open, setOpen] = useState<StoryReel | null>(null);
  return (
    <section aria-label="Sparks" className="flex gap-5 overflow-x-auto py-6">
      <Link
        href="/moments"
        className="flex shrink-0 flex-col items-center gap-2 text-xs"
      >
        <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-dashed">
          <Icon name="plus" size={26} />
        </span>
        Your spark
      </Link>
      {data?.reels.map((reel) => (
        <button
          key={reel.author.id}
          onClick={() => setOpen(reel)}
          className="flex shrink-0 flex-col items-center gap-2 text-xs"
        >
          <span className="story-ring rounded-full p-[3px]">
            <span className="block rounded-full bg-[rgb(var(--bg))] p-[3px]">
              <Avatar
                src={reel.author.avatarUrl}
                name={reel.author.displayName}
                size={56}
              />
            </span>
          </span>
          <span className="max-w-[74px] truncate">{reel.author.username}</span>
        </button>
      ))}
      {error && (
        <button
          className="text-xs text-[rgb(var(--text-muted))]"
          onClick={reload}
        >
          Reload stories
        </button>
      )}
      {open && <StoryViewer reel={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
export function StoryViewer({
  reel,
  onClose,
}: {
  reel: StoryReel;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [progress, setProgress] = useState(0);
  const { show } = useToast();
  const moment = reel.moments[index];
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    setProgress(0);
    setPaused(false);
  }, [index]);
  useEffect(() => {
    if (!video.current) return;
    if (paused) video.current.pause();
    else void video.current.play().catch(() => {});
  }, [paused, index]);
  useEffect(() => {
    if (paused || !moment || moment.kind === "video") return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        elapsed = now - previous;
      previous = now;
      setProgress((p) => Math.min(1, p + elapsed / 6000));
    }, 50);
    return () => clearInterval(timer);
  }, [paused, moment]);
  useEffect(() => {
    if (progress < 1) return;
    setProgress(0);
    if (index + 1 < reel.moments.length) setIndex(index + 1);
    else closeRef.current();
  }, [progress, index, reel.moments.length]);
  if (!moment) return null;
  const next = () =>
    index + 1 < reel.moments.length ? setIndex(index + 1) : onClose();
  async function react(emoji: string) {
    try {
      await api.post(`/api/moments/${moment!.id}/react`, { emoji });
      show("Reaction sent", "success");
    } catch {
      show("Could not send reaction", "error");
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      }}
      aria-label={`Spark by ${reel.author.username}`}
      className="fixed inset-0 m-auto h-[min(90dvh,820px)] w-[min(100%,460px)] overflow-hidden rounded-xl bg-zinc-950 p-0 text-white backdrop:bg-black/90"
    >
      <div className="relative flex h-full flex-col">
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="mb-4 flex gap-1">
            {reel.moments.map((m, i) => (
              <div
                key={m.id}
                className="h-0.5 flex-1 overflow-hidden rounded bg-white/30"
              >
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${i < index ? 100 : i === index ? progress * 100 : 0}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Avatar
              src={reel.author.avatarUrl}
              name={reel.author.displayName}
              size={32}
            />
            <Link
              href={`/profile/${reel.author.username}`}
              className="flex-1 text-sm font-semibold"
            >
              {reel.author.username}
            </Link>
            <button
              aria-label={paused ? "Resume spark" : "Pause spark"}
              onClick={() => setPaused((p) => !p)}
            >
              <Icon name={paused ? "play" : "pause"} size={20} />
            </button>
            <button aria-label="Close spark" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {moment.kind === "video" && moment.mediaUrl ? (
            <video
              ref={video}
              key={moment.id}
              src={moment.mediaUrl}
              autoPlay
              playsInline
              controls
              onPause={() => setPaused(true)}
              onPlay={() => setPaused(false)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration)
                  setProgress(Math.min(0.999, v.currentTime / v.duration));
              }}
              onEnded={next}
              className="h-full w-full object-contain"
            />
          ) : moment.mediaUrl ? (
            <img
              src={moment.mediaUrl}
              alt={moment.text ?? `Spark by ${reel.author.username}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-800 via-fuchsia-700 to-orange-500 px-10">
              <p className="text-center text-2xl font-semibold leading-relaxed">
                {moment.text}
              </p>
            </div>
          )}
          {moment.mediaUrl && moment.text && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10 text-center text-sm">
              {moment.text}
            </p>
          )}
          {index > 0 && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="absolute left-2 top-1/2 rounded-full bg-black/30 p-2"
              aria-label="Previous spark"
            >
              <Icon name="arrow" className="rotate-180" />
            </button>
          )}
          <button
            onClick={next}
            className="absolute right-2 top-1/2 rounded-full bg-black/30 p-2"
            aria-label="Next spark"
          >
            <Icon name="arrow" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-5 bg-zinc-950 p-5">
          {["❤️", "🔥", "👏", "😂", "😮"].map((emoji) => (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              aria-label={`React ${emoji}`}
              className="rounded-lg p-1 text-2xl transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
