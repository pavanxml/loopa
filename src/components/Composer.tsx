"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";
import { uploadMedia } from "@/lib/uploadClient";

interface UploadedMedia {
  url: string;
  kind: "image" | "video";
  previewUrl: string; // local object URL, revoked on removal/unmount
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export function Composer({ onPosted }: { onPosted?: () => void }) {
  const { show } = useToast();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "followers" | "friends" | "private"
  >("public");
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    },
    [],
  );

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    if (files.length === 0) return;
    if (media.length + files.length > 10) {
      show("You can attach up to 10 files per post.", "error");
      return;
    }

    setUploading(true);
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      try {
        const uploaded = await uploadMedia(file);
        setMedia((prev) => [
          ...prev,
          {
            ...uploaded,
            previewUrl,
          },
        ]);
      } catch (err) {
        URL.revokeObjectURL(previewUrl);
        show(
          err instanceof Error ? err.message : "Couldn't upload that file.",
          "error",
        );
      }
    }
    setUploading(false);
  }

  function removeMedia(index: number) {
    setMedia((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function getAiSuggestions() {
    if (!body.trim()) return;
    setLoadingSuggestions(true);
    try {
      const res = await api.post<{ hashtags: string[]; caption: string }>(
        "/api/ai/compose-assist",
        {
          draft: body,
        },
      );
      setSuggestions(res.hashtags);
    } catch {
      show("LOOPA AI couldn't generate suggestions right now.", "error");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && media.length === 0) return;
    setPosting(true);
    try {
      const hasVideo = media.some((m) => m.kind === "video");
      await api.post("/api/posts", {
        type: media.length > 0 ? (hasVideo ? "video" : "image") : "text",
        body: body || undefined,
        visibility,
        mediaUrls: media.map((m) => ({
          url: m.url,
          kind: m.kind,
          thumbnailUrl: m.thumbnailUrl,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs,
        })),
      });
      media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setBody("");
      setMedia([]);
      setSuggestions([]);
      show("Posted!", "success");
      onPosted?.();
    } catch (err) {
      show(
        err instanceof ApiClientError
          ? err.error.message
          : "Couldn't publish your post.",
        "error",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-4">
      <textarea
        className="input min-h-[84px] resize-none"
        placeholder="What's happening in your loop?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={3000}
        aria-label="Post content"
      />

      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m, i) => (
            <div
              key={m.previewUrl}
              className="group relative aspect-square overflow-hidden rounded-xl bg-black/5 dark:bg-white/5"
            >
              {m.kind === "video" ? (
                <video
                  src={m.previewUrl}
                  className="h-full w-full object-cover"
                  muted
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeMedia(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className="rounded-full bg-loop-50 px-2.5 py-1 text-xs font-medium text-loop-700 hover:bg-loop-100 dark:bg-white/10 dark:text-loop-200"
              onClick={() => setBody((b) => `${b} ${tag}`.trim())}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            aria-label="Attach photo or video"
          />
          <button
            type="button"
            className="btn-ghost px-2.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "📎 Photo/Video"}
          </button>
          <select
            className="input w-auto py-1.5 text-xs"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            aria-label="Post visibility"
          >
            <option value="public">Public</option>
            <option value="followers">Followers</option>
            <option value="friends">Connections</option>
            <option value="private">Private</option>
          </select>
          <button
            type="button"
            className="btn-ghost px-2.5 text-xs"
            onClick={getAiSuggestions}
            disabled={loadingSuggestions || !body.trim()}
          >
            {loadingSuggestions ? "Finding tags…" : "✦ Tag ideas"}
          </button>
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={
            posting || uploading || (!body.trim() && media.length === 0)
          }
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
