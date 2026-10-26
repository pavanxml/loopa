import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { filterVisiblePosts } from "@/lib/postAccess";

/** Topic feed — posts carrying this hashtag, ranked by engagement. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  try {
    const { tag } = await params;
    const viewer = await getCurrentUser();
    const normalized = tag.toLowerCase().replace(/^#/, "");

    const hashtag = db.prepare(`SELECT id, tag, useCount FROM hashtags WHERE tag = ?`).get(normalized) as
      | { id: string; tag: string; useCount: number } | undefined;
    if (!hashtag) throw new ApiError("not_found", "No posts use that topic yet.", 404);

    const posts = db.prepare(
      `SELECT p.id, p.body, p.createdAt, p.likeCount, p.commentCount,
              u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
       FROM post_hashtags ph
       JOIN posts p ON p.id = ph.postId
       JOIN users u ON u.id = p.authorId
       JOIN profiles pr ON pr.userId = p.authorId
       WHERE ph.hashtagId = ? AND p.status = 'published' AND p.deletedAt IS NULL AND p.visibility = 'public'
       ORDER BY (p.likeCount + p.commentCount * 2) DESC, p.createdAt DESC LIMIT 30`
    ).all(hashtag.id);

    const isFollowing = viewer
      ? !!db.prepare(`SELECT 1 FROM hashtag_follows WHERE userId = ? AND hashtagId = ?`)
          .get(viewer.sub, hashtag.id)
      : false;

    const followerCount = (db.prepare(`SELECT COUNT(*) c FROM hashtag_follows WHERE hashtagId = ?`)
      .get(hashtag.id) as { c: number }).c;

    return ok({ tag: hashtag.tag, useCount: hashtag.useCount, followerCount, isFollowing, posts:filterVisiblePosts(posts,viewer?.sub??null) });
  } catch (err) {
    return handleError(err);
  }
}

/** Follow/unfollow a topic. Also updates interest weights used by feed ranking. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  try {
    const session = await requireUser();
    const { tag } = await params;
    const normalized = tag.toLowerCase().replace(/^#/, "");

    const hashtag = db.prepare(`SELECT id FROM hashtags WHERE tag = ?`).get(normalized) as
      | { id: string } | undefined;
    if (!hashtag) throw new ApiError("not_found", "Topic not found.", 404);

    const existing = db.prepare(`SELECT id FROM hashtag_follows WHERE userId = ? AND hashtagId = ?`)
      .get(session.sub, hashtag.id);

    if (existing) {
      db.prepare(`DELETE FROM hashtag_follows WHERE userId = ? AND hashtagId = ?`).run(session.sub, hashtag.id);
      db.prepare(`DELETE FROM user_interests WHERE userId = ? AND topic = ?`).run(session.sub, normalized);
      return ok({ following: false });
    }

    db.prepare(`INSERT INTO hashtag_follows (id, userId, hashtagId) VALUES (?, ?, ?)`)
      .run(newId(), session.sub, hashtag.id);
    db.prepare(`INSERT OR IGNORE INTO user_interests (id, userId, topic, weight) VALUES (?, ?, ?, 1.0)`)
      .run(newId(), session.sub, normalized);

    return ok({ following: true });
  } catch (err) {
    return handleError(err);
  }
}
