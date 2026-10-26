import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { cursorPaginationSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    const { searchParams } = new URL(request.url);
    const { limit } = cursorPaginationSchema.parse({ limit: searchParams.get("limit") ?? undefined });

    const rows = db
      .prepare(
        `SELECT n.id, n.type, n.entityType, n.entityId, n.readAt, n.createdAt,
                u.username as actorUsername, p.displayName as actorDisplayName, p.avatarUrl as actorAvatarUrl
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actorId
         LEFT JOIN profiles p ON p.userId = n.actorId
         WHERE n.recipientId = ?
         ORDER BY n.createdAt DESC
         LIMIT ?`
      )
      .all(session.sub, limit);

    const unreadCount = (
      db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipientId = ? AND readAt IS NULL`).get(
        session.sub
      ) as { c: number }
    ).c;

    return ok({ items: rows, unreadCount });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { id?: string; markAll?: boolean };

    if (body.markAll) {
      db.prepare(`UPDATE notifications SET readAt = datetime('now') WHERE recipientId = ? AND readAt IS NULL`).run(
        session.sub
      );
    } else if (body.id) {
      db.prepare(`UPDATE notifications SET readAt = datetime('now') WHERE id = ? AND recipientId = ?`).run(
        body.id,
        session.sub
      );
    }

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
