import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { z } from "zod";

const COLUMNS = [
  "likes", "comments", "follows", "connection_request", "messages",
  "mentions", "community_activity", "event_reminder", "invitation",
  "moderation_action", "pushEnabled",
] as const;

const DEFAULTS = Object.fromEntries(COLUMNS.map((c) => [c, 1])) as Record<(typeof COLUMNS)[number], number>;

export async function GET() {
  try {
    const session = await requireUser();
    const row = db.prepare(`SELECT * FROM notification_preferences WHERE userId = ?`).get(session.sub) as
      Record<string, number> | undefined;
    return ok(row ? { ...row } : { userId: session.sub, ...DEFAULTS });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object(
  Object.fromEntries(COLUMNS.map((c) => [c, z.boolean().optional()]))
);

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = patchSchema.parse(await request.json());
    const updates = Object.entries(body).filter(([, v]) => v !== undefined) as [string, boolean][];
    if (updates.length === 0) return ok({ updated: false });

    const existing = db.prepare(`SELECT userId FROM notification_preferences WHERE userId = ?`).get(session.sub);
    if (!existing) {
      db.prepare(`INSERT INTO notification_preferences (userId) VALUES (?)`).run(session.sub);
    }

    const setClause = updates.map(([k]) => `"${k}" = ?`).join(", ");
    const values = updates.map(([, v]) => (v ? 1 : 0));
    db.prepare(`UPDATE notification_preferences SET ${setClause} WHERE userId = ?`).run(...values, session.sub);

    return ok({ updated: true });
  } catch (err) {
    return handleError(err);
  }
}
