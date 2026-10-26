"use client";
import Link from "next/link";
import { Icon } from "./Icon";
import type { FeedPost } from "@/types/feed";
export function MediaGrid({ posts }: { posts: FeedPost[] }) {
  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-2">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/post/${post.id}`}
          className="group relative aspect-square overflow-hidden bg-[rgb(var(--bg-subtle))]"
          aria-label={`Post by ${post.author.username}: ${post.body?.slice(0, 60) ?? "Media"}`}
        >
          {post.media[0]?.kind === "video" ? (
            <video
              src={post.media[0].url}
              poster={post.media[0].thumbnailUrl ?? undefined}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : post.media[0] ? (
            <img
              src={post.media[0].url}
              alt={post.body?.slice(0, 80) ?? "Photo"}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center border p-3 text-center text-xs sm:text-sm">
              <p className="line-clamp-5">{post.body}</p>
            </div>
          )}
          {post.media[0]?.kind === "video" && (
            <Icon
              name="reels"
              size={20}
              className="absolute right-2 top-2 text-white drop-shadow"
            />
          )}
          {post.media.length > 1 && (
            <span className="absolute right-2 top-2 rounded bg-black/40 px-1 text-xs text-white">
              {post.media.length}
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/40 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="flex items-center gap-1">
              <Icon name="heart" size={18} filled />
              {post.counts.likes}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="comment" size={18} />
              {post.counts.comments}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
