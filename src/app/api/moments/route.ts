import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { createMomentSchema } from "@/lib/validation";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { assertOwnedMedia } from "@/lib/postAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { ApiError } from "@/lib/api";

const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Moments expire 24h after creation. Expiry is enforced at read time by the
 * `expiresAt > now` predicate — never by trusting a client clock. A scheduled
 * job should also hard-delete expired rows and their media; until that worker
 * exists, this endpoint prunes opportunistically so the table can't grow
 * without bound.
 */
export async function GET() {
  try {
    const session = await requireUser();

    db.prepare(`DELETE FROM moments WHERE julianday(expiresAt) <= julianday('now')`).run();

    // Your own moments plus those of people you follow, grouped by author.
    const rows = db.prepare(
      `SELECT m.id, m.kind, m.mediaUrl, m.text, m.createdAt, m.expiresAt,
              u.id as authorId, u.username as authorUsername,
              pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl,
              (SELECT COUNT(*) FROM moment_reactions WHERE momentId = m.id) as reactionCount
       FROM moments m
       JOIN users u ON u.id = m.authorId
       JOIN profiles pr ON pr.userId = m.authorId
       WHERE julianday(m.expiresAt) > julianday('now') AND u.status='active'
         AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blockingId=? AND blockedId=m.authorId) OR (blockedId=? AND blockingId=m.authorId))
         AND NOT EXISTS (SELECT 1 FROM mutes WHERE mutingId=? AND mutedId=m.authorId)
         AND (m.authorId = ? OR m.authorId IN (SELECT followingId FROM follows WHERE followerId = ?))
       ORDER BY m.createdAt DESC LIMIT 200`
    ).all(session.sub,session.sub,session.sub,session.sub, session.sub) as Record<string, unknown>[];

    const byAuthor = new Map<string, { author: unknown; moments: unknown[] }>();
    for (const r of rows) {
      const key = r.authorId as string;
      if (!byAuthor.has(key)) {
        byAuthor.set(key, {
          author: {
            id: r.authorId, username: r.authorUsername,
            displayName: r.authorDisplayName, avatarUrl: r.authorAvatarUrl,
          },
          moments: [],
        });
      }
      byAuthor.get(key)!.moments.push({
        id: r.id, kind: r.kind, mediaUrl: r.mediaUrl, text: r.text,
        createdAt: r.createdAt, expiresAt: r.expiresAt, reactionCount: r.reactionCount,
      });
    }

    return ok({ reels: Array.from(byAuthor.values()) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = createMomentSchema.parse(await request.json());
    if(!(await checkRateLimit(`moments:${session.sub}`,20,60000)).allowed)throw new ApiError("rate_limited","Please wait before sharing another story.",429);
    if(body.mediaUrl)assertOwnedMedia(session.sub,body.mediaUrl);

    const id = newId();
    db.prepare(
      `INSERT INTO moments (id, authorId, kind, mediaUrl, text, expiresAt) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, session.sub, body.kind, body.mediaUrl ?? null, body.text ?? null,
          new Date(Date.now() + MOMENT_TTL_MS).toISOString());

    return ok({ id, expiresInHours: 24 }, 201);
  } catch (err) {
    return handleError(err);
  }
}
