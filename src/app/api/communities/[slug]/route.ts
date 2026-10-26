import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { updateCommunitySchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { canViewCommunity, getMembership, requireRole, writeAuditLog } from "@/lib/permissions";
import { filterVisiblePosts } from "@/lib/postAccess";

interface CommunityRow {
  id: string; slug: string; name: string; description: string | null;
  iconUrl: string | null; coverUrl: string | null; privacy: string;
  rules: string | null; ownerId: string; memberCount: number; createdAt: string;
}

function loadCommunity(slug: string): CommunityRow {
  const row = db
    .prepare(`SELECT * FROM communities WHERE slug = ? AND deletedAt IS NULL`)
    .get(slug) as CommunityRow | undefined;
  if (!row) throw new ApiError("not_found", "Community not found.", 404);
  return row;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const viewer = await getCurrentUser();
    const community = loadCommunity(slug);
    const membership = viewer ? getMembership(community.id, viewer.sub) : null;
    const visible = canViewCommunity(community, viewer?.sub ?? null);

    // Private communities always return their "cover" info so people can
    // request to join — but never their posts or member list.
    const base = {
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      iconUrl: community.iconUrl,
      coverUrl: community.coverUrl,
      privacy: community.privacy,
      memberCount: community.memberCount,
      createdAt: community.createdAt,
      viewerRole: membership?.status === "active" ? membership.role : null,
      canView: visible,
    };

    if (!visible) {
      return ok({ ...base, rules: null, posts: [], members: [], events: [] });
    }

    const posts = db
      .prepare(
        `SELECT p.id, p.body, p.type, p.createdAt, p.likeCount, p.commentCount, p.pinned,
                u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
         FROM posts p
         JOIN users u ON u.id = p.authorId
         JOIN profiles pr ON pr.userId = p.authorId
         WHERE p.communityId = ? AND p.status = 'published' AND p.deletedAt IS NULL
         ORDER BY p.pinned DESC, p.createdAt DESC LIMIT 30`
      )
      .all(community.id);

    const members = db
      .prepare(
        `SELECT cm.role, cm.joinedAt, u.id as userId, u.username, pr.displayName, pr.avatarUrl
         FROM community_members cm
         JOIN users u ON u.id = cm.userId
         JOIN profiles pr ON pr.userId = cm.userId
         WHERE cm.communityId = ? AND cm.status = 'active'
         ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
                  cm.joinedAt ASC
         LIMIT 50`
      )
      .all(community.id);

    const events = db
      .prepare(
        `SELECT id, title, startAt, mode, location, attendeeCount
         FROM events WHERE communityId = ? AND status = 'scheduled' AND startAt > datetime('now')
         ORDER BY startAt ASC LIMIT 10`
      )
      .all(community.id);

    return ok({ ...base, rules: community.rules, posts:filterVisiblePosts(posts,viewer?.sub??null), members, events });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;
    const community = loadCommunity(slug);
    requireRole(community.id, session.sub, "admin");

    const body = updateCommunitySchema.parse(await request.json());
    const fields = Object.entries(body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return ok({ updated: false });

    db.prepare(
      `UPDATE communities SET ${fields.map(([k]) => `${k} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = ?`
    ).run(...fields.map(([, v]) => v), community.id);

    writeAuditLog(session.sub, "community.update", "community", community.id);
    return ok({ updated: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;
    const community = loadCommunity(slug);
    requireRole(community.id, session.sub, "owner"); // owners only

    db.prepare(`UPDATE communities SET deletedAt = datetime('now') WHERE id = ?`).run(community.id);
    writeAuditLog(session.sub, "community.delete", "community", community.id);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
