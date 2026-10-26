import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { realtime } from "@/services/realtime";
import { requireConversationAccess } from "@/lib/postAccess";

/** Broadcasts a typing signal over the SSE channel. Fire-and-forget. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    requireConversationAccess(id,session.sub);

    const member = db.prepare(`SELECT id FROM conversation_members WHERE conversationId = ? AND userId = ?`)
      .get(id, session.sub);
    if (!member) throw new ApiError("forbidden", "You're not part of this conversation.", 403);

    db.prepare(
      `INSERT INTO presence (userId, lastSeenAt, typingInConversationId, typingUpdatedAt)
       VALUES (?, datetime('now'), ?, datetime('now'))
       ON CONFLICT(userId) DO UPDATE SET lastSeenAt = datetime('now'),
         typingInConversationId = ?, typingUpdatedAt = datetime('now')`
    ).run(session.sub, id, id);

    realtime.publish(id, { type: "typing", conversationId: id, userId: session.sub, username: session.username });
    return ok({ sent: true });
  } catch (err) {
    return handleError(err);
  }
}
