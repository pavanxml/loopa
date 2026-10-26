import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { resolveReportSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { requirePlatformAdmin, writeAuditLog } from "@/lib/permissions";
import { notifyIfEnabled } from "@/lib/notifications";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    requirePlatformAdmin(session.sub);

    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    const items = db.prepare(
      `SELECT r.id, r.reason, r.details, r.status, r.createdAt, r.postId, r.commentId, r.reportedUserId,
              ru.username as reporterUsername,
              tu.username as reportedUsername,
              (SELECT body FROM posts WHERE id = r.postId) as postBody,
              (SELECT body FROM comments WHERE id = r.commentId) as commentBody
       FROM reports r
       JOIN users ru ON ru.id = r.reporterId
       LEFT JOIN users tu ON tu.id = r.reportedUserId
       WHERE r.status = ?
       ORDER BY r.createdAt ASC LIMIT 100`
    ).all(status);

    return ok({ items, status });
  } catch (err) {
    return handleError(err);
  }
}

const resolveBody = resolveReportSchema.extend({ reportId: z.string().min(1) });

/** Resolve a report. Every outcome writes an audit log entry. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    requirePlatformAdmin(session.sub);
    const body = resolveBody.parse(await request.json());

    const report = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(body.reportId) as
      | { id: string; postId: string | null; commentId: string | null; reportedUserId: string | null }
      | undefined;
    if (!report) throw new ApiError("not_found", "Report not found.", 404);

    if (body.action === "remove_content") {
      if (report.postId) {
        db.prepare(`UPDATE posts SET status = 'removed', deletedAt = datetime('now') WHERE id = ?`)
          .run(report.postId);
        writeAuditLog(session.sub, "post.remove", "post", report.postId, { reportId: report.id });
      }
      if (report.commentId) {
        db.prepare(`UPDATE comments SET status = 'removed', deletedAt = datetime('now') WHERE id = ?`)
          .run(report.commentId);
        writeAuditLog(session.sub, "comment.remove", "comment", report.commentId, { reportId: report.id });
      }
    }

    if (body.action === "suspend_user" && report.reportedUserId) {
      db.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(report.reportedUserId);
      db.prepare(`UPDATE refresh_tokens SET revokedAt = datetime('now') WHERE userId = ? AND revokedAt IS NULL`)
        .run(report.reportedUserId);
      writeAuditLog(session.sub, "user.suspend", "user", report.reportedUserId, { reportId: report.id });
      notifyIfEnabled(report.reportedUserId, session.sub, "moderation_action", "user", report.reportedUserId);
    }

    db.prepare(
      `UPDATE reports SET status = ?, resolvedById = ?, resolvedAt = datetime('now') WHERE id = ?`
    ).run(body.action === "dismiss" ? "dismissed" : "actioned", session.sub, body.reportId);

    return ok({ resolved: true, action: body.action });
  } catch (err) {
    return handleError(err);
  }
}
