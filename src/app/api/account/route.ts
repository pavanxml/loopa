import { NextRequest } from "next/server";
import { db,transaction } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireUser, destroySession } from "@/lib/session";
import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["deactivate", "delete"]) });

/** PATCH: deactivate (reversible on next login) or soft-delete (irreversible-by-user) the account. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    const { action } = actionSchema.parse(await request.json());

    transaction(()=>{if (action === "deactivate") {
      db.prepare(`UPDATE users SET status = 'deactivated' WHERE id = ?`).run(session.sub);
    } else {
      // Soft delete: anonymize identifying fields, keep row for referential
      // integrity of posts/comments (shown as "[deleted user]"), revoke all sessions.
      db.prepare(
        `UPDATE users SET status = 'deleted', email = 'deleted_' || id || '@loopa.invalid' WHERE id = ?`
      ).run(session.sub);
      db.prepare(`UPDATE users SET username=?,passwordHash='' WHERE id=?`).run(`deleted_${session.sub}`,session.sub);
      db.prepare(`UPDATE profiles SET displayName='Deleted account',avatarUrl=NULL,coverUrl=NULL,bio=NULL,location=NULL,website=NULL,skills=NULL,latitude=NULL,longitude=NULL WHERE userId=?`).run(session.sub);
    }
    db.prepare(`UPDATE refresh_tokens SET revokedAt = datetime('now') WHERE userId = ? AND revokedAt IS NULL`).run(
      session.sub
    );
    });
    await destroySession();

    return ok({ success: true, action });
  } catch (err) {
    return handleError(err);
  }
}
