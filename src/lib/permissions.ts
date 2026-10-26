import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";

/**
 * Community authorization. Every community mutation routes through here.
 * The frontend hides buttons the user can't use, but that is cosmetic —
 * these checks are the actual boundary and run on every request.
 */
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

const ROLE_RANK: Record<CommunityRole, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export interface Membership {
  role: CommunityRole;
  status: string;
}

export function getMembership(communityId: string, userId: string): Membership | null {
  const row = db
    .prepare(`SELECT role, status FROM community_members WHERE communityId = ? AND userId = ?`)
    .get(communityId, userId) as Membership | undefined;
  return row ?? null;
}

export function hasRole(communityId: string, userId: string, minimum: CommunityRole): boolean {
  const m = getMembership(communityId, userId);
  if (!m || m.status !== "active") return false;
  return ROLE_RANK[m.role] >= ROLE_RANK[minimum];
}

/** Throws unless the user holds at least `minimum` in this community. */
export function requireRole(communityId: string, userId: string, minimum: CommunityRole): Membership {
  const m = getMembership(communityId, userId);
  if (!m || m.status !== "active") {
    throw new ApiError("forbidden", "You're not a member of this community.", 403);
  }
  if (ROLE_RANK[m.role] < ROLE_RANK[minimum]) {
    throw new ApiError("forbidden", `This action requires ${minimum} permissions.`, 403);
  }
  return m;
}

/** Can this user see a private community's contents? */
export function canViewCommunity(
  community: { id: string; privacy: string },
  userId: string | null
): boolean {
  if (community.privacy === "public") return true;
  if (!userId) return false;
  return hasRole(community.id, userId, "member");
}

/** A user may never act on someone of equal or higher rank than themselves. */
export function assertCanActOn(communityId: string, actorId: string, targetUserId: string): void {
  const actor = getMembership(communityId, actorId);
  const target = getMembership(communityId, targetUserId);
  if (!actor) throw new ApiError("forbidden", "You're not a member of this community.", 403);
  if (!target) throw new ApiError("not_found", "That user isn't a member.", 404);
  if (ROLE_RANK[actor.role] <= ROLE_RANK[target.role]) {
    throw new ApiError("forbidden", "You can't moderate someone at or above your own role.", 403);
  }
}

/** Platform-level admin check — separate from community roles. */
export function requirePlatformAdmin(userId: string): void {
  const row = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined;
  if (!row || (row.role !== "admin" && row.role !== "moderator")) {
    throw new ApiError("forbidden", "Admin access required.", 403);
  }
}

export function isPlatformAdmin(userId: string): boolean {
  const row = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined;
  return row?.role === "admin";
}

export function writeAuditLog(
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: unknown
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, actorId, action, targetType, targetId, metadata) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    actorId,
    action,
    targetType ?? null,
    targetId ?? null,
    metadata ? JSON.stringify(metadata) : null
  );
}
