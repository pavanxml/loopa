import { NextRequest } from "next/server";
import { db,transaction } from "@/lib/db";
import { blocked as isBlocked,requireConversationAccess } from "@/lib/postAccess";
import { newId } from "@/lib/id";
import { createConversationSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";

/** List the viewer's conversations with last message and unread count. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    // One query with correlated subqueries rather than a query per
    // conversation for the last message / unread count (avoids N+1).
    const base = `
      SELECT c.id, c.isGroup, c.title, c.updatedAt,
        (SELECT body FROM messages WHERE conversationId = c.id AND deletedAt IS NULL
          ORDER BY createdAt DESC LIMIT 1) as lastMessage,
        (SELECT createdAt FROM messages WHERE conversationId = c.id AND deletedAt IS NULL
          ORDER BY createdAt DESC LIMIT 1) as lastMessageAt,
        (SELECT COUNT(*) FROM messages m WHERE m.conversationId = c.id AND m.senderId != ?
          AND (cm.lastReadAt IS NULL OR m.createdAt > cm.lastReadAt)) as unreadCount
      FROM conversations c
      JOIN conversation_members cm ON cm.conversationId = c.id AND cm.userId = ?
    `;

    const rows = q
      ? db.prepare(`${base} WHERE EXISTS (
            SELECT 1 FROM messages m2 WHERE m2.conversationId = c.id AND m2.body LIKE ?
          ) OR c.title LIKE ?
          ORDER BY c.updatedAt DESC LIMIT 50`)
          .all(session.sub, session.sub, `%${q}%`, `%${q}%`)
      : db.prepare(`${base} ORDER BY c.updatedAt DESC LIMIT 50`).all(session.sub, session.sub);

    // Attach the other participants (batched, one query total).
    const ids = (rows as { id: string }[]).map((r) => r.id);
    const participantsByConv = new Map<string, unknown[]>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const parts = db.prepare(
        `SELECT cm.conversationId, u.username, pr.displayName, pr.avatarUrl,
                (SELECT lastSeenAt FROM presence WHERE userId = u.id) as lastSeenAt
         FROM conversation_members cm
         JOIN users u ON u.id = cm.userId
         JOIN profiles pr ON pr.userId = cm.userId
         WHERE cm.conversationId IN (${ph}) AND cm.userId != ?`
      ).all(...ids, session.sub) as Record<string, unknown>[];
      for (const p of parts) {
        const key = p.conversationId as string;
        if (!participantsByConv.has(key)) participantsByConv.set(key, []);
        participantsByConv.get(key)!.push(p);
      }
    }

    const items = (rows as Record<string, unknown>[]).filter(r=>{try{requireConversationAccess(r.id as string,session.sub);return true;}catch(error){if(error instanceof ApiError)return false;throw error;}}).map((r) => ({
      ...r, participants: participantsByConv.get(r.id as string) ?? [],
    }));
    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}

/** Create (or return the existing) conversation. Respects each recipient's DM policy. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = createConversationSchema.parse(await request.json());

    const participantIds: string[] = [];
    for (const username of new Set(body.participantUsernames)) {
      const user = db.prepare(
        `SELECT u.id, p.dmPolicy FROM users u JOIN profiles p ON p.userId = u.id
         WHERE u.username = ? AND u.status = 'active'`
      ).get(username) as { id: string; dmPolicy: string } | undefined;
      if (!user) throw new ApiError("not_found", `No user @${username}.`, 404);
      if (user.id === session.sub) continue;

      // Blocks and DM policy are enforced here, on the server.
      const blocked = db.prepare(`SELECT 1 FROM blocks WHERE blockingId = ? AND blockedId = ?`)
        .get(user.id, session.sub);
      if (blocked||isBlocked(user.id,session.sub)) throw new ApiError("forbidden", `You can't message @${username}.`, 403);

      if (user.dmPolicy === "none") {
        throw new ApiError("dm_closed", `@${username} isn't accepting messages.`, 403);
      }
      if (user.dmPolicy === "followers") {
        const follows = db.prepare(`SELECT 1 FROM follows WHERE followerId = ? AND followingId = ?`)
          .get(user.id, session.sub);
        if (!follows) throw new ApiError("dm_restricted", `@${username} only accepts messages from people they follow.`, 403);
      }
      participantIds.push(user.id);
    }

    if (participantIds.length === 0) throw new ApiError("validation_error", "Add at least one other person.", 422);

    return transaction(()=>{
    const isGroup = participantIds.length > 1;

    // Reuse an existing 1:1 conversation instead of creating duplicates.
    if (!isGroup) {
      const existing = db.prepare(
        `SELECT c.id FROM conversations c
         WHERE c.isGroup = 0
           AND EXISTS (SELECT 1 FROM conversation_members WHERE conversationId = c.id AND userId = ?)
           AND EXISTS (SELECT 1 FROM conversation_members WHERE conversationId = c.id AND userId = ?)
           AND (SELECT COUNT(*) FROM conversation_members WHERE conversationId = c.id) = 2`
      ).get(session.sub, participantIds[0]!) as { id: string } | undefined;
      if (existing) return ok({ id: existing.id, existing: true });
    }

    const id = newId();
    db.prepare(`INSERT INTO conversations (id, isGroup, title) VALUES (?, ?, ?)`)
      .run(id, isGroup ? 1 : 0, body.title ?? null);
    for (const uid of [session.sub, ...participantIds]) {
      db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
        .run(newId(), id, uid);
    }

    return ok({ id, existing: false }, 201);
    });
  } catch (err) {
    return handleError(err);
  }
}
