import { db } from "@/lib/db";
import { newId } from "@/lib/id";

/**
 * Every notification in the app is created through this one function so
 * preferences are enforced in exactly one place rather than re-checked (or
 * forgotten) at each call site.
 *
 * `type` must match a column in `notification_preferences`. Moderation
 * actions bypass the preference check by design — a suspension or content
 * removal notice isn't something a user should be able to silence.
 */
const PREFERENCE_COLUMNS = new Set([
  "like", "comment", "follow", "connection_request", "message",
  "mention", "community_activity", "event_reminder", "invitation",
]);

// notification `type` values use singular/plural inconsistently elsewhere in
// the codebase (e.g. "like" vs a `likes` column) — this maps type → column.
const TYPE_TO_COLUMN: Record<string, string> = {
  like: "likes",
  comment: "comments",
  follow: "follows",
  connection_request: "connection_request",
  message: "messages",
  mention: "mentions",
  community_activity: "community_activity",
  event_reminder: "event_reminder",
  invitation: "invitation",
};

function isEnabled(userId: string, type: string): boolean {
  if (type === "moderation_action") return true; // never silenceable
  const column = TYPE_TO_COLUMN[type];
  if (!column) return true; // unknown type — fail open rather than silently drop

  const row = db.prepare(`SELECT ${column} as v FROM notification_preferences WHERE userId = ?`).get(userId) as
    | { v: number } | undefined;
  return row ? row.v === 1 : true; // no row yet = defaults = enabled
}

export function notifyIfEnabled(
  recipientId: string,
  actorId: string | null,
  type: string,
  entityType?: string,
  entityId?: string
): void {
  if (recipientId === actorId) return; // never notify yourself
  if (!isEnabled(recipientId, type)) return;

  db.prepare(
    `INSERT INTO notifications (id, recipientId, actorId, type, entityType, entityId)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId(), recipientId, actorId, type, entityType ?? null, entityId ?? null);
}

export { PREFERENCE_COLUMNS };
