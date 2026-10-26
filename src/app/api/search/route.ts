import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { searchSchema } from "@/lib/validation";
import { ok, handleError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { filterVisiblePosts,filterVisibleEvents,safePeople,visibleHashtags } from "@/lib/postAccess";

/**
 * Turns free-text user input into an FTS5 query: strips characters FTS5's
 * query syntax would otherwise interpret as operators, then prefix-matches
 * each remaining token so "data perf" finds "database performance". Real
 * SQLite full-text search with bm25 ranking — not a LIKE scan.
 */
function toFtsQuery(q: string): string | null {
  const tokens = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(" OR ");
}

/**
 * Unified search across users, posts, hashtags, communities, and events.
 *
 * Uses LIKE with a prefix/substring match. That's honest for this scale and
 * uses the existing indexes where it can; a production deployment should
 * move to Postgres full-text search (tsvector + GIN) or Meilisearch —
 * the response shape here is designed so that swap is invisible to callers.
 */
export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const { q, type, limit } = searchSchema.parse({
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const like = `%${q}%`;
    const prefix = `${q}%`;
    const result: Record<string, unknown[]> = {};

    if (type === "all" || type === "users") {
      result.users = db.prepare(
        `SELECT u.username, p.displayName, p.avatarUrl, p.bio,
                (SELECT COUNT(*) FROM follows WHERE followingId = u.id) as followerCount
         FROM users u JOIN profiles p ON p.userId = u.id
         WHERE u.status = 'active' AND (u.username LIKE ? OR p.displayName LIKE ?)
         ORDER BY CASE WHEN u.username LIKE ? THEN 0 ELSE 1 END, followerCount DESC
         LIMIT ?`
      ).all(like, like, prefix, limit);
    }

    if (type === "all" || type === "posts") {
      const ftsMatch = toFtsQuery(q);
      result.posts = ftsMatch
        ? db.prepare(
            `SELECT p.id, p.body, p.createdAt, p.likeCount, p.commentCount,
                    u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
             FROM posts_fts f
             JOIN posts p ON p.id = f.postId
             JOIN users u ON u.id = p.authorId
             JOIN profiles pr ON pr.userId = p.authorId
             WHERE posts_fts MATCH ? AND p.status = 'published' AND p.deletedAt IS NULL AND p.visibility = 'public'
             ORDER BY bm25(posts_fts) ASC LIMIT ?`
          ).all(ftsMatch, limit)
        : [];
    }

    if (type === "all" || type === "hashtags") {
      result.hashtags = visibleHashtags(viewer?.sub??null,limit,q);
    }

    if (type === "all" || type === "communities") {
      result.communities = db.prepare(
        `SELECT slug, name, description, iconUrl, memberCount, privacy
         FROM communities WHERE deletedAt IS NULL AND privacy!='invite_only' AND (name LIKE ? OR description LIKE ?)
         ORDER BY memberCount DESC LIMIT ?`
      ).all(like, like, limit);
    }

    if (type === "all" || type === "events") {
      result.events = db.prepare(
        `SELECT id, title, startAt, mode, location, attendeeCount
         FROM events WHERE status = 'scheduled' AND startAt > datetime('now') AND title LIKE ?
         ORDER BY startAt ASC LIMIT ?`
      ).all(like, limit);
    }

    if(result.posts)result.posts=filterVisiblePosts(result.posts,viewer?.sub??null);
    if(result.users)result.users=safePeople(result.users,viewer?.sub??null);
    if(result.events)result.events=filterVisibleEvents(result.events,viewer?.sub??null);
    return ok({ query: q, type, results: result, viewerIsAuthenticated: !!viewer });
  } catch (err) {
    return handleError(err);
  }
}
