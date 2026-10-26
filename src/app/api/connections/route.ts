import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { connectionRequestSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";

/**
 * Mutual connections, distinct from one-directional follows. A pending
 * request in either direction blocks sending a second one; acceptance
 * makes the relationship mutual and visible to both sides.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    const box = new URL(request.url).searchParams.get("box") ?? "incoming";

    if (box === "outgoing") {
      const items = db.prepare(
        `SELECT c.id, c.status, c.createdAt, u.username, p.displayName, p.avatarUrl
         FROM connections c JOIN users u ON u.id = c.addresseeId JOIN profiles p ON p.userId = u.id
         WHERE c.requesterId = ? ORDER BY c.createdAt DESC`
      ).all(session.sub);
      return ok({ items });
    }

    if (box === "accepted") {
      const items = db.prepare(
        `SELECT c.id, c.respondedAt,
                CASE WHEN c.requesterId = ? THEN u2.username ELSE u1.username END as username,
                CASE WHEN c.requesterId = ? THEN p2.displayName ELSE p1.displayName END as displayName,
                CASE WHEN c.requesterId = ? THEN p2.avatarUrl ELSE p1.avatarUrl END as avatarUrl
         FROM connections c
         JOIN users u1 ON u1.id = c.requesterId JOIN profiles p1 ON p1.userId = c.requesterId
         JOIN users u2 ON u2.id = c.addresseeId JOIN profiles p2 ON p2.userId = c.addresseeId
         WHERE c.status = 'accepted' AND (c.requesterId = ? OR c.addresseeId = ?)
         ORDER BY c.respondedAt DESC`
      ).all(session.sub, session.sub, session.sub, session.sub, session.sub);
      return ok({ items });
    }

    // incoming (default)
    const items = db.prepare(
      `SELECT c.id, c.status, c.createdAt, u.username, p.displayName, p.avatarUrl
       FROM connections c JOIN users u ON u.id = c.requesterId JOIN profiles p ON p.userId = u.id
       WHERE c.addresseeId = ? AND c.status = 'pending' ORDER BY c.createdAt DESC`
    ).all(session.sub);
    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const { username } = connectionRequestSchema.parse(await request.json());

    const target = db.prepare(`SELECT id FROM users WHERE username = ? AND status = 'active'`).get(username) as
      | { id: string } | undefined;
    if (!target) throw new ApiError("not_found", "User not found.", 404);
    if (target.id === session.sub) throw new ApiError("invalid_action", "You can't connect with yourself.", 400);

    const blocked = db.prepare(
      `SELECT 1 FROM blocks WHERE (blockingId = ? AND blockedId = ?) OR (blockingId = ? AND blockedId = ?)`
    ).get(session.sub, target.id, target.id, session.sub);
    if (blocked) throw new ApiError("forbidden", "Can't send a connection request here.", 403);

    const existing = db.prepare(
      `SELECT id, status, requesterId FROM connections
       WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`
    ).get(session.sub, target.id, target.id, session.sub) as
      | { id: string; status: string; requesterId: string } | undefined;

    if (existing) {
      if (existing.status === "accepted") throw new ApiError("already_connected", "You're already connected.", 409);
      if (existing.status === "pending" && existing.requesterId !== session.sub) {
        throw new ApiError("pending_incoming", "This person already sent you a request — check your incoming requests.", 409);
      }
      throw new ApiError("already_pending", "Request already sent.", 409);
    }

    const id = newId();
    db.prepare(`INSERT INTO connections (id, requesterId, addresseeId) VALUES (?, ?, ?)`)
      .run(id, session.sub, target.id);
    notifyIfEnabled(target.id, session.sub, "connection_request", "user", session.sub);

    return ok({ id, status: "pending" }, 201);
  } catch (err) {
    return handleError(err);
  }
}
