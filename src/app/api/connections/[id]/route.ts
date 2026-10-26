import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { connectionRespondSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";

/** Accept or decline an incoming request. Only the addressee may respond. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const { action } = connectionRespondSchema.parse(await request.json());

    const conn = db.prepare(`SELECT requesterId, addresseeId, status FROM connections WHERE id = ?`).get(id) as
      | { requesterId: string; addresseeId: string; status: string } | undefined;
    if (!conn) throw new ApiError("not_found", "Request not found.", 404);
    if (conn.addresseeId !== session.sub) throw new ApiError("forbidden", "This request isn't addressed to you.", 403);
    if (conn.status !== "pending") throw new ApiError("already_resolved", "This request was already resolved.", 409);

    db.prepare(`UPDATE connections SET status = ?, respondedAt = datetime('now') WHERE id = ?`)
      .run(action === "accept" ? "accepted" : "declined", id);

    if (action === "accept") {
      notifyIfEnabled(conn.requesterId, session.sub, "connection_request", "user", session.sub);
    }
    return ok({ status: action === "accept" ? "accepted" : "declined" });
  } catch (err) {
    return handleError(err);
  }
}

/** Withdraw a request you sent, or remove an accepted connection either side. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const conn = db.prepare(`SELECT requesterId, addresseeId FROM connections WHERE id = ?`).get(id) as
      | { requesterId: string; addresseeId: string } | undefined;
    if (!conn) throw new ApiError("not_found", "Request not found.", 404);
    if (conn.requesterId !== session.sub && conn.addresseeId !== session.sub) {
      throw new ApiError("forbidden", "Not your connection.", 403);
    }
    db.prepare(`DELETE FROM connections WHERE id = ?`).run(id);
    return ok({ removed: true });
  } catch (err) {
    return handleError(err);
  }
}
