import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { FeedPost } from "@/types/feed";

export function blocked(a: string, b: string): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM blocks WHERE (blockingId=? AND blockedId=?) OR (blockingId=? AND blockedId=?)`,
    )
    .get(a, b, b, a);
}

/** One visibility rule for feeds, search, media, profiles and direct interactions. */
export function postVisibility(viewerId: string | null, alias = "p") {
  if (!/^[a-z]+$/.test(alias)) throw new Error("Invalid internal SQL alias");
  const v = viewerId ?? "";
  return {
    sql: `${alias}.status='published' AND ${alias}.deletedAt IS NULL
      AND EXISTS (SELECT 1 FROM users au JOIN profiles ap ON ap.userId=au.id WHERE au.id=${alias}.authorId AND au.status='active'
        AND (au.id=? OR ap.privacy='public' OR EXISTS (SELECT 1 FROM follows WHERE followerId=? AND followingId=au.id)))
      AND (${alias}.authorId=? OR ${alias}.visibility='public'
        OR (${alias}.visibility='followers' AND EXISTS (SELECT 1 FROM follows WHERE followerId=? AND followingId=${alias}.authorId))
        OR (${alias}.visibility='friends' AND EXISTS (SELECT 1 FROM connections WHERE status='accepted'
          AND ((requesterId=? AND addresseeId=${alias}.authorId) OR (addresseeId=? AND requesterId=${alias}.authorId)))))
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blockingId=? AND blockedId=${alias}.authorId) OR (blockedId=? AND blockingId=${alias}.authorId))
      AND (${alias}.communityId IS NULL OR EXISTS (SELECT 1 FROM communities c WHERE c.id=${alias}.communityId AND c.deletedAt IS NULL
        AND (c.privacy='public' OR EXISTS (SELECT 1 FROM community_members WHERE communityId=c.id AND userId=? AND status='active'))
        AND NOT EXISTS (SELECT 1 FROM community_members WHERE communityId=c.id AND userId=? AND status='banned')))`,
    params: [v, v, v, v, v, v, v, v, v, v],
  };
}
export interface PostRow
  extends Record<string, import("node:sqlite").SQLOutputValue> {
  id: string;
  authorId: string;
  body: string | null;
  type: string;
  visibility: string;
  location: string | null;
  communityId: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  commentPolicy: string;
  pollJson: string | null;
}
export function visiblePost(id: string, viewerId: string | null): PostRow {
  const access = postVisibility(viewerId);
  const row = db
    .prepare(`SELECT p.* FROM posts p WHERE p.id=? AND ${access.sql}`)
    .get(id, ...access.params) as PostRow | undefined;
  if (!row)
    throw new ApiError("not_found", "Post not found or unavailable.", 404);
  return row;
}
export function toFeedPosts(
  rows: PostRow[],
  viewerId: string | null,
): FeedPost[] {
  if (!rows.length) return [];
  const placeholders = rows.map(() => "?").join(","),
    ids = rows.map((p) => p.id);
  const media = db
    .prepare(
      `SELECT postId,url,kind,thumbnailUrl FROM post_media WHERE postId IN (${placeholders}) ORDER BY "order"`,
    )
    .all(...ids) as {
    postId: string;
    url: string;
    kind: string;
    thumbnailUrl: string | null;
  }[];
  const authors = db
    .prepare(
      `SELECT u.id,u.username,pr.displayName,pr.avatarUrl FROM users u JOIN profiles pr ON pr.userId=u.id WHERE u.id IN (${placeholders})`,
    )
    .all(...rows.map((p) => p.authorId)) as {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }[];
  const likes = new Set(
    (
      db
        .prepare(
          `SELECT postId FROM likes WHERE userId=? AND postId IN (${placeholders})`,
        )
        .all(viewerId ?? "", ...ids) as { postId: string }[]
    ).map((r) => r.postId),
  );
  const saves = new Set(
    (
      db
        .prepare(
          `SELECT postId FROM saves WHERE userId=? AND postId IN (${placeholders})`,
        )
        .all(viewerId ?? "", ...ids) as { postId: string }[]
    ).map((r) => r.postId),
  );
  const byAuthor = new Map(authors.map((a) => [a.id, a]));
  return rows.map((row) => ({
    id: row.id,
    author: byAuthor.get(row.authorId)!,
    type: row.type,
    body: row.body,
    location: row.location,
    createdAt: row.createdAt.includes("T")
      ? row.createdAt
      : row.createdAt.replace(" ", "T") + "Z",
    media: media.filter((m) => m.postId === row.id),
    counts: {
      likes: row.likeCount,
      comments: row.commentCount,
      shares: row.shareCount,
      saves: row.saveCount,
    },
    viewer: {
      liked: likes.has(row.id),
      saved: saves.has(row.id),
      isOwner: viewerId === row.authorId,
    },
  }));
}
export function assertOwnedMedia(userId: string, url: string) {
  if (url.startsWith("/api/media/")) {
    const thumb = /^\/api\/media\/(image|video)\/([a-f0-9-]+)_thumb\.jpg$/.exec(
      url,
    );
    const owned = thumb
      ? db
          .prepare(`SELECT 1 FROM uploads WHERE userId=? AND storageKey LIKE ?`)
          .get(userId, `${thumb[1]}/${thumb[2]}.%`)
      : db
          .prepare(`SELECT 1 FROM uploads WHERE userId=? AND url=?`)
          .get(userId, url);
    if (!owned)
      throw new ApiError(
        "invalid_media",
        "Upload your own media before attaching it.",
        403,
      );
  } else if (!/^https:\/\//.test(url))
    throw new ApiError(
      "invalid_media",
      "Use an uploaded file or an HTTPS URL.",
      422,
    );
}

export function filterVisiblePosts<T>(rows: T[], viewerId: string | null): T[] {
  return rows.filter((row) => {
    const id = (row as { id?: unknown }).id;
    if (typeof id !== "string") return false;
    try {
      visiblePost(id, viewerId);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return false;
      throw error;
    }
  });
}

export function requireConversationAccess(
  conversationId: string,
  userId: string,
) {
  const member = db
    .prepare(
      `SELECT 1 FROM conversation_members WHERE conversationId=? AND userId=?`,
    )
    .get(conversationId, userId);
  if (!member)
    throw new ApiError(
      "forbidden",
      "You're not part of this conversation.",
      403,
    );
  const denied = db
    .prepare(
      `SELECT 1 FROM conversation_members cm JOIN blocks b ON (b.blockingId=cm.userId AND b.blockedId=?) OR (b.blockedId=cm.userId AND b.blockingId=?) WHERE cm.conversationId=?`,
    )
    .get(userId, userId, conversationId);
  if (denied)
    throw new ApiError(
      "forbidden",
      "This conversation is unavailable because an account is blocked.",
      403,
    );
}

export function canViewEvent(id: string, viewerId: string | null): boolean {
  const v = viewerId ?? "";
  return !!db
    .prepare(
      `SELECT 1 FROM events e JOIN users u ON u.id=e.hostId WHERE e.id=? AND u.status='active'
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE(blockingId=? AND blockedId=e.hostId)OR(blockedId=? AND blockingId=e.hostId))
    AND(e.communityId IS NULL OR EXISTS(SELECT 1 FROM communities c WHERE c.id=e.communityId AND c.deletedAt IS NULL
      AND(c.privacy='public' OR EXISTS(SELECT 1 FROM community_members WHERE communityId=c.id AND userId=? AND status='active'))
      AND NOT EXISTS(SELECT 1 FROM community_members WHERE communityId=c.id AND userId=? AND status='banned')))`,
    )
    .get(id, v, v, v, v);
}
export function filterVisibleEvents<T>(
  rows: T[],
  viewerId: string | null,
): T[] {
  return rows.filter((row) =>
    canViewEvent(String((row as { id: string }).id), viewerId),
  );
}

/** Basic account discovery never reveals a private profile's bio or location. */
export function safePeople<T>(rows: T[], viewerId: string | null): T[] {
  return rows.flatMap((row) => {
    const username = String((row as { username: string }).username);
    const user = db
      .prepare(
        `SELECT u.id,p.privacy FROM users u JOIN profiles p ON p.userId=u.id WHERE u.username=? AND u.status='active'`,
      )
      .get(username) as { id: string; privacy: string } | undefined;
    if (!user || blocked(viewerId ?? "", user.id)) return [];
    const visible =
      user.privacy === "public" ||
      user.id === viewerId ||
      !!db
        .prepare(`SELECT 1 FROM follows WHERE followerId=? AND followingId=?`)
        .get(viewerId ?? "", user.id);
    return [
      visible
        ? row
        : {
            ...row,
            bio: null,
            location: null,
            distanceKm: null,
            latitude: null,
            longitude: null,
          },
    ];
  });
}

export function visibleHashtags(
  viewerId: string | null,
  limit: number,
  query = "",
) {
  const access = postVisibility(viewerId);
  return db
    .prepare(
      `SELECT h.tag,COUNT(*) AS useCount,(SELECT COUNT(*) FROM hashtag_follows WHERE hashtagId=h.id) AS followerCount
    FROM hashtags h JOIN post_hashtags ph ON ph.hashtagId=h.id JOIN posts p ON p.id=ph.postId
    WHERE h.tag LIKE ? AND ${access.sql} GROUP BY h.id ORDER BY useCount DESC,h.tag LIMIT ?`,
    )
    .all(`%${query}%`, ...access.params, limit);
}
