import { NextRequest } from "next/server";
import { db,transaction } from "@/lib/db";
import { newId } from "@/lib/id";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";
import { canViewEvent } from "@/lib/postAccess";

/** Toggle attendance, enforcing capacity server-side. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    return transaction(()=>{
    if(!canViewEvent(id,session.sub))throw new ApiError("not_found","Event not found.",404);

    const event = db
      .prepare(`SELECT id, hostId, capacity, attendeeCount, status, startAt FROM events WHERE id = ?`)
      .get(id) as { id: string; hostId: string; capacity: number | null; attendeeCount: number; status: string; startAt: string } | undefined;
    if (!event) throw new ApiError("not_found", "Event not found.", 404);
    if (event.status === "cancelled") throw new ApiError("event_cancelled", "This event was cancelled.", 400);

    const existing = db.prepare(`SELECT id FROM event_attendees WHERE eventId = ? AND userId = ?`)
      .get(id, session.sub);

    if (existing) {
      if (event.hostId === session.sub) {
        throw new ApiError("host_cannot_leave", "Hosts can't leave their own event — cancel it instead.", 400);
      }
      db.prepare(`DELETE FROM event_attendees WHERE eventId = ? AND userId = ?`).run(id, session.sub);
      db.prepare(`UPDATE events SET attendeeCount = MAX(0, attendeeCount - 1) WHERE id = ?`).run(id);
      return ok({ attending: false });
    }

    if (event.capacity !== null && event.attendeeCount >= event.capacity) {
      throw new ApiError("event_full", "This event has reached capacity.", 409);
    }

    db.prepare(`INSERT INTO event_attendees (id, eventId, userId, status) VALUES (?, ?, ?, 'going')`)
      .run(newId(), id, session.sub);
    db.prepare(`UPDATE events SET attendeeCount = attendeeCount + 1 WHERE id = ?`).run(id);

    notifyIfEnabled(event.hostId, session.sub, "event_reminder", "event", id);

    return ok({ attending: true });
    });
  } catch (err) {
    return handleError(err);
  }
}
