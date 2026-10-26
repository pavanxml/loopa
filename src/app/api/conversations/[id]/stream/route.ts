import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { realtime } from "@/services/realtime";
import { fail } from "@/lib/api";
import { requireConversationAccess } from "@/lib/postAccess";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for one conversation.
 *
 * This is genuine server push: the connection stays open and the server
 * writes the instant something happens (a message, a typing signal, a read
 * receipt). The client uses EventSource and never polls. Heartbeat comments
 * keep proxies from closing an idle connection — they are not a poll.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser().catch(() => null);
  if (!session) return fail("unauthenticated", "Please sign in to continue.", 401);

  const { id } = await params;
  const member = db.prepare(`SELECT id FROM conversation_members WHERE conversationId = ? AND userId = ?`)
    .get(id, session.sub);
  if (!member) return fail("forbidden", "You're not part of this conversation.", 403);
  try{requireConversationAccess(id,session.sub);}catch{return fail("forbidden","Conversation unavailable.",403);}

  db.prepare(
    `INSERT INTO presence (userId, lastSeenAt) VALUES (?, datetime('now'))
     ON CONFLICT(userId) DO UPDATE SET lastSeenAt = datetime('now')`
  ).run(session.sub);

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const authorized=()=>{
        const active=db.prepare(`SELECT 1 FROM refresh_tokens rt JOIN users u ON u.id=rt.userId WHERE rt.id=? AND rt.revokedAt IS NULL AND u.status='active' AND julianday(rt.expiresAt)>julianday('now')`).get(session.sid??"");
        try{requireConversationAccess(id,session.sub);return !!active;}catch{return false;}
      };
      const close=()=>{clearInterval(heartbeat);unsubscribe();try{controller.close();}catch{/* already closed */}};
      const send = (data: unknown) => {
        if(!authorized()){close();return;}
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected mid-write */ }
      };

      send({ type: "connected", conversationId: id });
      unsubscribe = realtime.subscribe(id, (event) => send(event));

      heartbeat = setInterval(() => {
        if(!authorized()){close();return;}
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
          db.prepare(`UPDATE presence SET lastSeenAt = datetime('now') WHERE userId = ?`).run(session.sub);
        } catch { /* closed */ }
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
