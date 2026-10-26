import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { postVisibility, toFeedPosts, type PostRow } from "@/lib/postAccess";
import { scorePost } from "@/lib/ranking";

export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser(),
      uid = viewer?.sub ?? "";
    const query = z
      .object({
        mode: z
          .enum(["for_you", "following", "reels", "explore"])
          .default("for_you"),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z
          .string()
          .regex(/^[a-f0-9-]{36}:\d{1,4}$/)
          .optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const access = postVisibility(uid);
    let snapshotId: string,
      orderedIds: string[],
      offset = 0;
    db.prepare(`DELETE FROM feed_snapshots WHERE expiresAt<?`).run(
      new Date().toISOString(),
    );
    if (query.cursor) {
      const [sid, index] = query.cursor.split(":");
      snapshotId = sid!;
      offset = Number(index);
      const snapshot = db
        .prepare(
          `SELECT postIds FROM feed_snapshots WHERE id=? AND userId=? AND mode=? AND expiresAt>?`,
        )
        .get(snapshotId, uid, query.mode, new Date().toISOString()) as
        | { postIds: string }
        | undefined;
      if (!snapshot)
        throw new ApiError(
          "cursor_expired",
          "This feed has expired. Refresh to see new posts.",
          400,
        );
      orderedIds = JSON.parse(snapshot.postIds) as string[];
    } else {
      const extra =
        query.mode === "following"
          ? `AND p.authorId IN (SELECT followingId FROM follows WHERE followerId=?)`
          : query.mode === "reels"
            ? `AND EXISTS (SELECT 1 FROM post_media WHERE postId=p.id AND kind='video')`
            : query.mode === "explore"
              ? `AND EXISTS (SELECT 1 FROM post_media WHERE postId=p.id)`
              : "";
      const rows = db
        .prepare(
          `SELECT p.* FROM posts p WHERE ${access.sql}
        AND NOT EXISTS (SELECT 1 FROM mutes WHERE mutingId=? AND mutedId=p.authorId)
        AND NOT EXISTS (SELECT 1 FROM hidden_posts WHERE userId=? AND postId=p.id) ${extra}
        ORDER BY p.createdAt DESC,p.id DESC LIMIT 300`,
        )
        .all(
          ...access.params,
          uid,
          uid,
          ...(query.mode === "following" ? [uid] : []),
        ) as PostRow[];
      const followed = new Set(
        (
          db
            .prepare(`SELECT followingId FROM follows WHERE followerId=?`)
            .all(uid) as { followingId: string }[]
        ).map((r) => r.followingId),
      );
      const communities = new Set(
        (
          db
            .prepare(
              `SELECT communityId FROM community_members WHERE userId=? AND status='active'`,
            )
            .all(uid) as { communityId: string }[]
        ).map((r) => r.communityId),
      );
      const interests = new Map(
        (
          db
            .prepare(`SELECT topic,weight FROM user_interests WHERE userId=?`)
            .all(uid) as { topic: string; weight: number }[]
        ).map((r) => [r.topic.toLowerCase().replace(/^#/, ""), r.weight]),
      );
      const signals = new Map<string, { overlap: number; reports: number }>();
      if (rows.length) {
        const placeholders = rows.map(() => "?").join(","),
          ids = rows.map((p) => p.id);
        const tags = db
          .prepare(
            `SELECT ph.postId,h.tag FROM post_hashtags ph JOIN hashtags h ON h.id=ph.hashtagId WHERE ph.postId IN (${placeholders})`,
          )
          .all(...ids) as { postId: string; tag: string }[];
        const reports = db
          .prepare(
            `SELECT postId,COUNT(*) AS count FROM reports WHERE postId IN (${placeholders}) AND status!='dismissed' GROUP BY postId`,
          )
          .all(...ids) as { postId: string; count: number }[];
        for (const p of rows) {
          const ownTags = tags.filter((t) => t.postId === p.id);
          signals.set(p.id, {
            overlap: ownTags.length
              ? Math.min(
                  1,
                  ownTags.reduce(
                    (n, t) => n + (interests.get(t.tag.toLowerCase()) ?? 0),
                    0,
                  ) / ownTags.length,
                )
              : 0,
            reports: reports.find((r) => r.postId === p.id)?.count ?? 0,
          });
        }
      }
      orderedIds = (
        query.mode === "following"
          ? rows
          : rows.sort((a, b) => score(b) - score(a))
      ).map((p) => p.id);
      function score(p: PostRow) {
        return scorePost({
          ageHours: Math.max(
            0,
            (Date.now() -
              new Date(
                p.createdAt.includes("T")
                  ? p.createdAt
                  : p.createdAt.replace(" ", "T") + "Z",
              ).getTime()) /
              3600000,
          ),
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          shareCount: p.shareCount,
          authorIsFollowed: followed.has(p.authorId),
          sameCommunityMembership:
            !!p.communityId && communities.has(p.communityId),
          interestOverlapScore: signals.get(p.id)?.overlap ?? 0,
          reportCount: signals.get(p.id)?.reports ?? 0,
        });
      }
      snapshotId = randomUUID();
      db.prepare(
        `INSERT INTO feed_snapshots (id,userId,mode,postIds,expiresAt) VALUES (?,?,?,?,?)`,
      ).run(
        snapshotId,
        uid,
        query.mode,
        JSON.stringify(orderedIds),
        new Date(Date.now() + 15 * 60000).toISOString(),
      );
    }
    const pageIds = orderedIds.slice(offset, offset + query.limit);
    const rows = pageIds.length
      ? (db
          .prepare(
            `SELECT p.* FROM posts p WHERE p.id IN (${pageIds.map(() => "?").join(",")}) AND ${access.sql}
      AND NOT EXISTS (SELECT 1 FROM hidden_posts WHERE userId=? AND postId=p.id)
      AND NOT EXISTS (SELECT 1 FROM mutes WHERE mutingId=? AND mutedId=p.authorId)`,
          )
          .all(...pageIds, ...access.params, uid, uid) as PostRow[])
      : [];
    rows.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));
    return ok({
      items: toFeedPosts(rows, uid),
      nextCursor:
        offset + query.limit < orderedIds.length
          ? `${snapshotId}:${offset + query.limit}`
          : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
