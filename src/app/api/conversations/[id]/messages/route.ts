import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { createMessageSchema, cursorPaginationSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { realtime } from "@/services/realtime";
import { notifyIfEnabled } from "@/lib/notifications";
import { requireConversationAccess, assertOwnedMedia } from "@/lib/postAccess";
import { checkRateLimit } from "@/lib/rateLimit";

/** Membership check — every message operation runs through this first. */
function requireMember(conversationId: string, userId: string) {
  requireConversationAccess(conversationId,userId);
  const row = db.prepare(`SELECT id FROM conversation_members WHERE conversationId = ? AND userId = ?`)
    .get(conversationId, userId);
  if (!row) throw new ApiError("forbidden", "You're not part of this conversation.", 403);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    requireMember(id, session.sub);

    const { searchParams } = new URL(request.url);
    const { limit } = cursorPaginationSchema.parse({ limit: searchParams.get("limit") ?? undefined });
    const before = searchParams.get("before");

    const rows = db.prepare(
      `SELECT m.id, m.body, m.kind, m.mediaUrl, m.replyToId, m.createdAt, m.deletedAt,
              u.username as senderUsername, pr.displayName as senderDisplayName, pr.avatarUrl as senderAvatarUrl,
              (SELECT body FROM messages WHERE id = m.replyToId AND conversationId=m.conversationId AND deletedAt IS NULL) as replyToBody
       FROM messages m
       JOIN users u ON u.id = m.senderId
       JOIN profiles pr ON pr.userId = m.senderId
       WHERE m.conversationId = ? ${before ? "AND m.createdAt < ?" : ""}
       ORDER BY m.createdAt DESC LIMIT ?`
    ).all(...(before ? [id, before, limit] : [id, limit])) as Record<string, unknown>[];

    // Reactions for this page, batched.
    const ids = rows.map((r) => r.id as string);
    const reactionsByMessage = new Map<string, unknown[]>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const reactions = db.prepare(
        `SELECT mr.messageId, mr.emoji, u.username FROM message_reactions mr
         JOIN users u ON u.id = mr.userId WHERE mr.messageId IN (${ph})`
      ).all(...ids) as Record<string, unknown>[];
      for (const r of reactions) {
        const key = r.messageId as string;
        if (!reactionsByMessage.has(key)) reactionsByMessage.set(key, []);
        reactionsByMessage.get(key)!.push({ emoji: r.emoji, username: r.username });
      }
    }

    // Opening the thread marks it read.
    db.prepare(`UPDATE conversation_members SET lastReadAt = datetime('now') WHERE conversationId = ? AND userId = ?`)
      .run(id, session.sub);
    realtime.publish(id, { type: "read", conversationId: id, userId: session.sub });

    const items = rows.reverse().map((r) => ({
      ...r,
      body: r.deletedAt ? null : r.body,
      mediaUrl: r.deletedAt ? null : r.mediaUrl,
      deleted: !!r.deletedAt,
      reactions: reactionsByMessage.get(r.id as string) ?? [],
    }));

    return ok({ items, nextCursor: rows.length === limit ? rows[0]?.createdAt ?? null : null });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    requireMember(id, session.sub);

    const body = createMessageSchema.parse(await request.json());
    if(!(await checkRateLimit(`messages:${session.sub}`,60,60000)).allowed)throw new ApiError("rate_limited","Slow down for a moment.",429);
    if(body.mediaUrl)assertOwnedMedia(session.sub,body.mediaUrl);
    if(body.replyToId&&!db.prepare(`SELECT 1 FROM messages WHERE id=? AND conversationId=? AND deletedAt IS NULL`).get(body.replyToId,id))throw new ApiError("invalid_reply","Reply must reference a message in this conversation.",422);
    const messageId = newId();

    db.prepare(
      `INSERT INTO messages (id, conversationId, senderId, kind, body, mediaUrl, replyToId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(messageId, id, session.sub, body.kind, body.body ?? null, body.mediaUrl ?? null, body.replyToId ?? null);
    db.prepare(`UPDATE conversations SET updatedAt = datetime('now') WHERE id = ?`).run(id);

    const message = db.prepare(
      `SELECT m.id, m.body, m.kind, m.mediaUrl, m.replyToId, m.createdAt,
              u.username as senderUsername, pr.displayName as senderDisplayName, pr.avatarUrl as senderAvatarUrl
       FROM messages m JOIN users u ON u.id = m.senderId JOIN profiles pr ON pr.userId = m.senderId
       WHERE m.id = ?`
    ).get(messageId);

    // Real server push to everyone watching this conversation's SSE stream.
    realtime.publish(id, { type: "message", conversationId: id, payload: message });

    const others = db.prepare(
      `SELECT userId FROM conversation_members WHERE conversationId = ? AND userId != ?`
    ).all(id, session.sub) as { userId: string }[];
    for (const o of others) {
      notifyIfEnabled(o.userId, session.sub, "message", "message", id);
    }

    return ok(message, 201);
  } catch (err) {
    return handleError(err);
  }
}

/** Delete one of your own messages (soft delete — preserves thread continuity). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    requireMember(id, session.sub);

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    if (!messageId) throw new ApiError("validation_error", "messageId is required.", 422);

    const msg = db.prepare(`SELECT senderId FROM messages WHERE id = ? AND conversationId = ?`)
      .get(messageId, id) as { senderId: string } | undefined;
    if (!msg) throw new ApiError("not_found", "Message not found.", 404);
    if (msg.senderId !== session.sub) throw new ApiError("forbidden", "You can only delete your own messages.", 403);

    db.prepare(`UPDATE messages SET deletedAt = datetime('now'), body = NULL WHERE id = ?`).run(messageId);
    realtime.publish(id,{type:"deleted",conversationId:id,messageId});
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
