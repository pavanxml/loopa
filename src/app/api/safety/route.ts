import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["block", "unblock", "mute", "unmute"]),
  username: z.string().min(1),
});

/**
 * Block and mute. Blocking is mutual severance: it also removes follow edges
 * in both directions, so a blocked user can't keep seeing follower-only content.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = schema.parse(await request.json());

    const target = db.prepare(`SELECT id FROM users WHERE username = ?`).get(body.username) as
      | { id: string } | undefined;
    if (!target) throw new ApiError("not_found", "User not found.", 404);
    if (target.id === session.sub) throw new ApiError("invalid_action", "You can't do that to yourself.", 400);

    switch (body.action) {
      case "block":
        db.prepare(`INSERT OR IGNORE INTO blocks (id, blockingId, blockedId) VALUES (?, ?, ?)`)
          .run(newId(), session.sub, target.id);
        db.prepare(`DELETE FROM follows WHERE (followerId = ? AND followingId = ?) OR (followerId = ? AND followingId = ?)`)
          .run(session.sub, target.id, target.id, session.sub);
        db.prepare(`DELETE FROM follow_requests WHERE (requesterId=? AND targetId=?) OR (requesterId=? AND targetId=?)`).run(session.sub,target.id,target.id,session.sub);
        db.prepare(`DELETE FROM connections WHERE (requesterId=? AND addresseeId=?) OR (requesterId=? AND addresseeId=?)`).run(session.sub,target.id,target.id,session.sub);
        return ok({ blocked: true });
      case "unblock":
        db.prepare(`DELETE FROM blocks WHERE blockingId = ? AND blockedId = ?`).run(session.sub, target.id);
        return ok({ blocked: false });
      case "mute":
        db.prepare(`INSERT OR IGNORE INTO mutes (id, mutingId, mutedId) VALUES (?, ?, ?)`)
          .run(newId(), session.sub, target.id);
        return ok({ muted: true });
      case "unmute":
        db.prepare(`DELETE FROM mutes WHERE mutingId = ? AND mutedId = ?`).run(session.sub, target.id);
        return ok({ muted: false });
    }
  } catch (err) {
    return handleError(err);
  }
}

/** The viewer's current block and mute lists. */
export async function GET() {
  try {
    const session = await requireUser();
    const blocked = db.prepare(
      `SELECT u.username, p.displayName, p.avatarUrl FROM blocks b
       JOIN users u ON u.id = b.blockedId JOIN profiles p ON p.userId = b.blockedId
       WHERE b.blockingId = ?`
    ).all(session.sub);
    const muted = db.prepare(
      `SELECT u.username, p.displayName, p.avatarUrl FROM mutes m
       JOIN users u ON u.id = m.mutedId JOIN profiles p ON p.userId = m.mutedId
       WHERE m.mutingId = ?`
    ).all(session.sub);
    return ok({ blocked, muted });
  } catch (err) {
    return handleError(err);
  }
}
