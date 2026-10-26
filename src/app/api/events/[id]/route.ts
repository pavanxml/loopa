import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/permissions";
import { notifyIfEnabled } from "@/lib/notifications";
import { canViewEvent } from "@/lib/postAccess";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await getCurrentUser();
    if(!canViewEvent(id,viewer?.sub??null))throw new ApiError("not_found","Event not found.",404);

    const event = db.prepare(
      `SELECT e.*, u.username as hostUsername, pr.displayName as hostDisplayName, pr.avatarUrl as hostAvatarUrl,
              c.slug as communitySlug, c.name as communityName
       FROM events e
       JOIN users u ON u.id = e.hostId
       JOIN profiles pr ON pr.userId = e.hostId
       LEFT JOIN communities c ON c.id = e.communityId
       WHERE e.id = ?`
    ).get(id);
    if (!event) throw new ApiError("not_found", "Event not found.", 404);

    const attendees = db.prepare(
      `SELECT u.username, pr.displayName, pr.avatarUrl, ea.status
       FROM event_attendees ea
       JOIN users u ON u.id = ea.userId
       JOIN profiles pr ON pr.userId = ea.userId
       WHERE ea.eventId = ? ORDER BY ea.createdAt ASC LIMIT 50`
    ).all(id);

    const isAttending = viewer
      ? !!db.prepare(`SELECT 1 FROM event_attendees WHERE eventId = ? AND userId = ?`).get(id, viewer.sub)
      : false;

    return ok({ event, attendees, isAttending });
  } catch (err) {
    return handleError(err);
  }
}

/** Cancel an event. Host only. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const event = db.prepare(`SELECT hostId FROM events WHERE id = ?`).get(id) as { hostId: string } | undefined;
    if (!event) throw new ApiError("not_found", "Event not found.", 404);
    if (event.hostId !== session.sub) throw new ApiError("forbidden", "Only the host can cancel this event.", 403);

    db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`).run(id);

    // Tell everyone who was going.
    const attendees = db.prepare(`SELECT userId FROM event_attendees WHERE eventId = ?`).all(id) as { userId: string }[];
    for (const a of attendees) {
      notifyIfEnabled(a.userId, session.sub, "event_reminder", "event", id);
    }
    writeAuditLog(session.sub, "event.cancel", "event", id);
    return ok({ cancelled: true });
  } catch (err) {
    return handleError(err);
  }
}
