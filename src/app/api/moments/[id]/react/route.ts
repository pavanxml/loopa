import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { z } from "zod";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";
import { blocked } from "@/lib/postAccess";

const schema = z.object({ emoji: z.string().min(1).max(8), reply: z.string().max(500).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const moment = db
      .prepare(`SELECT authorId FROM moments WHERE id = ? AND julianday(expiresAt) > julianday('now')`)
      .get(id) as { authorId: string } | undefined;
    if (!moment) throw new ApiError("not_found", "This moment has expired or doesn't exist.", 404);
    if(blocked(session.sub,moment.authorId)||(moment.authorId!==session.sub&&!db.prepare(`SELECT 1 FROM follows WHERE followerId=? AND followingId=?`).get(session.sub,moment.authorId)))throw new ApiError("not_found","This spark is unavailable.",404);

    db.prepare(`INSERT OR IGNORE INTO moment_reactions (id, momentId, userId, emoji) VALUES (?, ?, ?, ?)`)
      .run(newId(), id, session.sub, body.emoji);

    if (body.reply?.trim()) {
      db.prepare(`INSERT INTO moment_replies (id, momentId, userId, body) VALUES (?, ?, ?, ?)`)
        .run(newId(), id, session.sub, body.reply);
    }

    notifyIfEnabled(moment.authorId, session.sub, "like", "moment", id);

    return ok({ reacted: true });
  } catch (err) {
    return handleError(err);
  }
}
