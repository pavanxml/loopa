import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { isPlatformAdmin, requirePlatformAdmin, writeAuditLog } from "@/lib/permissions";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    requirePlatformAdmin(session.sub);

    const q = new URL(request.url).searchParams.get("q")?.trim();
    const like = `%${q ?? ""}%`;

    const items = db.prepare(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.createdAt, u.emailVerifiedAt,
              p.displayName,
              (SELECT COUNT(*) FROM posts WHERE authorId = u.id AND deletedAt IS NULL) as postCount,
              (SELECT COUNT(*) FROM reports WHERE reportedUserId = u.id) as reportCount
       FROM users u JOIN profiles p ON p.userId = u.id
       WHERE u.status != 'deleted' AND (? = '' OR u.username LIKE ? OR p.displayName LIKE ?)
       ORDER BY u.createdAt DESC LIMIT 100`
    ).all(q ?? "", like, like);

    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}

const actionSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["suspend", "reinstate"]),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    requirePlatformAdmin(session.sub);
    // Suspension is an admin-only power; moderators can review but not suspend.
    if (!isPlatformAdmin(session.sub)) {
      throw new ApiError("forbidden", "Only admins can change account status.", 403);
    }

    const body = actionSchema.parse(await request.json());
    if (body.userId === session.sub) {
      throw new ApiError("invalid_action", "You can't change your own account status.", 400);
    }

    const target = db.prepare(`SELECT role FROM users WHERE id = ?`).get(body.userId) as
      | { role: string } | undefined;
    if (!target) throw new ApiError("not_found", "User not found.", 404);
    if (target.role === "admin") {
      throw new ApiError("forbidden", "Admin accounts can't be suspended from this dashboard.", 403);
    }

    if (body.action === "suspend") {
      db.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(body.userId);
      db.prepare(`UPDATE refresh_tokens SET revokedAt = datetime('now') WHERE userId = ? AND revokedAt IS NULL`)
        .run(body.userId);
    } else {
      db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(body.userId);
    }

    writeAuditLog(session.sub, `user.${body.action}`, "user", body.userId);
    return ok({ updated: true, action: body.action });
  } catch (err) {
    return handleError(err);
  }
}
