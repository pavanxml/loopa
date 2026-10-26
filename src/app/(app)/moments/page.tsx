"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { uploadMedia, type UploadedFile } from "@/lib/uploadClient";
import { Avatar, EmptyState } from "@/components/ui";
import { AsyncBoundary, PageHeader, useApi } from "@/components/data";
import { StoryViewer, type StoryReel } from "@/components/Stories";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
export default function MomentsPage() {
  const { show } = useToast(),
    [text, setText] = useState(""),
    [file, setFile] = useState<UploadedFile | null>(null),
    [uploading, setUploading] = useState(false),
    [posting, setPosting] = useState(false),
    [selected, setSelected] = useState<StoryReel | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { data, error, loading, reload } = useApi<{ reels: StoryReel[] }>(
    "/api/moments",
  );
  async function upload(selectedFile: File) {
    setUploading(true);
    try {
      setFile(await uploadMedia(selectedFile));
    } catch (err) {
      show(err instanceof Error ? err.message : "Could not upload", "error");
    } finally {
      setUploading(false);
    }
  }
  async function post(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      await api.post("/api/moments", {
        kind: file ? (file.kind === "video" ? "video" : "photo") : "text",
        text: text || undefined,
        mediaUrl: file?.url,
      });
      setText("");
      setFile(null);
      show("Spark shared for 24 hours", "success");
      reload();
    } catch (err) {
      show(
        err instanceof Error ? err.message : "Could not share spark",
        "error",
      );
    } finally {
      setPosting(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        title="Sparks"
        subtitle="The little moments. Here for 24 hours."
      />
      <form onSubmit={post} className="mb-8 rounded-xl border p-5">
        <h2 className="mb-4 text-sm font-semibold">Create a spark</h2>
        {file && (
          <div className="relative mb-4 overflow-hidden rounded-xl bg-black">
            {file.kind === "video" ? (
              <video
                src={file.url}
                controls
                className="max-h-72 w-full object-contain"
              />
            ) : (
              <img
                src={file.url}
                alt="Spark preview"
                className="max-h-72 w-full object-contain"
              />
            )}
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove spark media"
              className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <textarea
          className="input min-h-24 resize-none"
          placeholder="A moment worth sharing…"
          aria-label="Spark text"
          maxLength={280}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={uploading || posting}
            onClick={() => input.current?.click()}
          >
            <Icon name="image" size={18} />
            {uploading ? "Uploading…" : "Photo or video"}
          </button>
          <button
            className="btn-primary"
            disabled={posting || uploading || (!text.trim() && !file)}
          >
            {posting ? "Sharing…" : "Share spark"}
          </button>
        </div>
      </form>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}>
        {data?.reels.length === 0 ? (
          <EmptyState
            icon={<Icon name="camera" size={40} />}
            title="Your spark starts here"
            description="Sparks from you and the people you follow appear here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {data?.reels.map((reel) => (
              <button
                key={reel.author.id}
                onClick={() => setSelected(reel)}
                className="relative flex aspect-[3/4] items-end overflow-hidden rounded-xl bg-gradient-to-br from-violet-600 to-rose-400 p-4 text-white"
              >
                {reel.moments[0]?.mediaUrl &&
                  reel.moments[0]?.kind !== "video" && (
                    <img
                      src={reel.moments[0].mediaUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="relative text-left">
                  <Avatar
                    src={reel.author.avatarUrl}
                    name={reel.author.displayName}
                    size={38}
                  />
                  <p className="mt-2 text-sm font-semibold">
                    {reel.author.username}
                  </p>
                  <p className="text-xs opacity-70">
                    {reel.moments.length} moments
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </AsyncBoundary>
      {selected && (
        <StoryViewer
          key={selected.author.id}
          reel={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
