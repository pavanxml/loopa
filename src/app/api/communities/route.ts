import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { createCommunitySchema, cursorPaginationSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const { limit } = cursorPaginationSchema.parse({ limit: searchParams.get("limit") ?? undefined });
    const mine = searchParams.get("mine") === "true";

    // Private/invite-only communities are listed (name + description only, so
    // they're discoverable) but their contents require membership.
    const rows = mine && viewer
      ? (db
          .prepare(
            `SELECT c.id, c.slug, c.name, c.description, c.iconUrl, c.privacy, c.memberCount, cm.role
             FROM communities c
             JOIN community_members cm ON cm.communityId = c.id AND cm.userId = ? AND cm.status = 'active'
             WHERE c.deletedAt IS NULL
             ORDER BY c.memberCount DESC LIMIT ?`
          )
          .all(viewer.sub, limit))
      : (db
          .prepare(
            `SELECT id, slug, name, description, iconUrl, privacy, memberCount
             FROM communities WHERE deletedAt IS NULL
             ORDER BY memberCount DESC, createdAt DESC LIMIT ?`
          )
          .all(limit));

    // One query for all memberships instead of one per community (avoids N+1).
    let memberOf = new Set<string>();
    if (viewer && rows.length > 0) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const memberships = db
        .prepare(
          `SELECT communityId FROM community_members WHERE userId = ? AND status = 'active' AND communityId IN (${placeholders})`
        )
        .all(viewer.sub, ...ids) as { communityId: string }[];
      memberOf = new Set(memberships.map((m) => m.communityId));
    }

    const items = (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      isMember: memberOf.has(r.id as string),
    }));

    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = createCommunitySchema.parse(await request.json());

    const existing = db.prepare(`SELECT id FROM communities WHERE slug = ?`).get(body.slug);
    if (existing) throw new ApiError("slug_taken", "That community address is already taken.", 409);

    const id = newId();
    db.prepare(
      `INSERT INTO communities (id, slug, name, description, privacy, rules, ownerId, memberCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, body.slug, body.name, body.description ?? null, body.privacy, body.rules ?? null, session.sub);

    // The creator is seeded as owner — the only way an owner row is ever created.
    db.prepare(
      `INSERT INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, 'owner')`
    ).run(newId(), id, session.sub);

    writeAuditLog(session.sub, "community.create", "community", id, { slug: body.slug });

    return ok({ id, slug: body.slug }, 201);
  } catch (err) {
    return handleError(err);
  }
}
