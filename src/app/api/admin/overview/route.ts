import { db } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { requirePlatformAdmin } from "@/lib/permissions";

/**
 * Platform analytics. Deliberately aggregate-only — counts and rates, never
 * per-user browsing histories or tracking identifiers. Activity metrics are
 * derived from content people chose to create, not from surveillance.
 */
export async function GET() {
  try {
    const session = await requireUser();
    requirePlatformAdmin(session.sub);

    const scalar = (sql: string, ...args: import("node:sqlite").SQLInputValue[]) =>
      (db.prepare(sql).get(...args) as { c: number }).c;

    // DAU/MAU proxied by content activity — no separate event-tracking table,
    // which keeps the privacy surface small.
    const dau = scalar(
      `SELECT COUNT(DISTINCT authorId) c FROM posts WHERE createdAt > datetime('now','-1 day')`
    ) + scalar(
      `SELECT COUNT(DISTINCT authorId) c FROM comments WHERE createdAt > datetime('now','-1 day')`
    );
    const mau = scalar(
      `SELECT COUNT(DISTINCT authorId) c FROM posts WHERE createdAt > datetime('now','-30 days')`
    );

    const stats = {
      users: {
        total: scalar(`SELECT COUNT(*) c FROM users WHERE status != 'deleted'`),
        active: scalar(`SELECT COUNT(*) c FROM users WHERE status = 'active'`),
        suspended: scalar(`SELECT COUNT(*) c FROM users WHERE status = 'suspended'`),
        newLast7Days: scalar(`SELECT COUNT(*) c FROM users WHERE createdAt > datetime('now','-7 days')`),
        dailyActive: dau,
        monthlyActive: mau,
      },
      content: {
        posts: scalar(`SELECT COUNT(*) c FROM posts WHERE deletedAt IS NULL`),
        postsLast7Days: scalar(`SELECT COUNT(*) c FROM posts WHERE createdAt > datetime('now','-7 days')`),
        comments: scalar(`SELECT COUNT(*) c FROM comments WHERE deletedAt IS NULL`),
        likes: scalar(`SELECT COUNT(*) c FROM likes`),
        saves: scalar(`SELECT COUNT(*) c FROM saves`),
        moments: scalar(`SELECT COUNT(*) c FROM moments WHERE expiresAt > datetime('now')`),
      },
      communities: {
        total: scalar(`SELECT COUNT(*) c FROM communities WHERE deletedAt IS NULL`),
        totalMemberships: scalar(`SELECT COUNT(*) c FROM community_members WHERE status = 'active'`),
        newLast7Days: scalar(`SELECT COUNT(*) c FROM communities WHERE createdAt > datetime('now','-7 days')`),
      },
      events: {
        upcoming: scalar(`SELECT COUNT(*) c FROM events WHERE status='scheduled' AND startAt > datetime('now')`),
        totalAttendance: scalar(`SELECT COUNT(*) c FROM event_attendees`),
      },
      moderation: {
        pendingReports: scalar(`SELECT COUNT(*) c FROM reports WHERE status = 'pending'`),
        resolvedReports: scalar(`SELECT COUNT(*) c FROM reports WHERE status IN ('actioned','dismissed')`),
      },
      systemHealth: {
        databaseReachable: true,
        auditLogEntries: scalar(`SELECT COUNT(*) c FROM audit_logs`),
        checkedAt: new Date().toISOString(),
      },
    };

    const growth = db.prepare(
      `SELECT date(createdAt) as day, COUNT(*) as count FROM posts
       WHERE createdAt > datetime('now','-14 days') GROUP BY day ORDER BY day ASC`
    ).all();

    return ok({ stats, growth });
  } catch (err) {
    return handleError(err);
  }
}
