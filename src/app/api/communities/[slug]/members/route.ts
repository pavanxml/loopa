import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { memberRoleSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { assertCanActOn, getMembership, requireRole, writeAuditLog } from "@/lib/permissions";
import { notifyIfEnabled } from "@/lib/notifications";

function loadCommunity(slug: string) {
  const row = db
    .prepare(`SELECT id, privacy, ownerId FROM communities WHERE slug = ? AND deletedAt IS NULL`)
    .get(slug) as { id: string; privacy: string; ownerId: string } | undefined;
  if (!row) throw new ApiError("not_found", "Community not found.", 404);
  return row;
}

/** POST = join (or request to join for invite-only). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;
    const community = loadCommunity(slug);

    const existing = getMembership(community.id, session.sub);
    if (existing?.status === "active") throw new ApiError("already_member", "You're already a member.", 409);
    if (existing?.status === "banned") throw new ApiError("banned", "You can't join this community.", 403);

    // Invite-only communities create a pending row that a moderator approves;
    // public and private ones join immediately (private = hidden content, not gated entry).
    const status = community.privacy === "invite_only" ? "pending" : "active";

    if (existing) {
      db.prepare(`UPDATE community_members SET status = ? WHERE communityId = ? AND userId = ?`).run(
        status, community.id, session.sub
      );
    } else {
      db.prepare(`INSERT INTO community_members (id, communityId, userId, role, status) VALUES (?, ?, ?, 'member', ?)`)
        .run(newId(), community.id, session.sub, status);
    }

    if (status === "active") {
      db.prepare(`UPDATE communities SET memberCount = memberCount + 1 WHERE id = ?`).run(community.id);
    }

    return ok({ joined: status === "active", pending: status === "pending" });
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE = leave. Owners must transfer ownership first. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;
    const community = loadCommunity(slug);

    const membership = getMembership(community.id, session.sub);
    if (!membership) throw new ApiError("not_member", "You're not a member of this community.", 400);
    if (membership.role === "owner") {
      throw new ApiError("owner_cannot_leave", "Transfer ownership before leaving your own community.", 400);
    }

    db.prepare(`DELETE FROM community_members WHERE communityId = ? AND userId = ?`).run(community.id, session.sub);
    db.prepare(`UPDATE communities SET memberCount = MAX(0, memberCount - 1) WHERE id = ?`).run(community.id);
    return ok({ left: true });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH = change a member's role. Admin+ only, and never on a peer/superior. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;
    const community = loadCommunity(slug);
    requireRole(community.id, session.sub, "admin");

    const body = memberRoleSchema.parse(await request.json());
    assertCanActOn(community.id, session.sub, body.userId);

    db.prepare(`UPDATE community_members SET role = ? WHERE communityId = ? AND userId = ?`).run(
      body.role, community.id, body.userId
    );
    writeAuditLog(session.sub, "community.role_change", "community", community.id, {
      targetUserId: body.userId, role: body.role,
    });

    notifyIfEnabled(body.userId, session.sub, "community_activity", "community", community.id);

    return ok({ updated: true });
  } catch (err) {
    return handleError(err);
  }
}
