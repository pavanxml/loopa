import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { updateProfileSchema } from "@/lib/validation";
import { blocked, assertOwnedMedia } from "@/lib/postAccess";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const viewer = await getCurrentUser();

    const user = db
      .prepare(
        `SELECT u.id, u.username, u.createdAt, u.status,
                p.displayName, p.avatarUrl, p.coverUrl, p.bio, p.location, p.website, p.skills, p.privacy
         FROM users u JOIN profiles p ON p.userId = u.id
         WHERE u.username = ? AND u.status = 'active'`
      )
      .get(username) as
      | {
          id: string; username: string; createdAt: string; status: string; displayName: string;
          avatarUrl: string | null; coverUrl: string | null; bio: string | null; location: string | null;
          website: string | null; skills: string | null; privacy: string;
        }
      | undefined;

    if (!user) throw new ApiError("not_found", "User not found.", 404);
    if(viewer&&blocked(viewer.sub,user.id))throw new ApiError("not_found","User not found.",404);

    const followerCount = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE followingId = ?`).get(user.id) as { c: number }
    ).c;
    const followingCount = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE followerId = ?`).get(user.id) as { c: number }
    ).c;
    const postCount = (
      db.prepare(`SELECT COUNT(*) as c FROM posts WHERE authorId = ? AND status = 'published'`).get(user.id) as {
        c: number;
      }
    ).c;

    let isFollowing = false;
    if (viewer && viewer.sub !== user.id) {
      const row = db
        .prepare(`SELECT 1 FROM follows WHERE followerId = ? AND followingId = ?`)
        .get(viewer.sub, user.id);
      isFollowing = !!row;
    }

    const requested=!!viewer&&!!db.prepare(`SELECT 1 FROM follow_requests WHERE requesterId=? AND targetId=?`).get(viewer.sub,user.id);
    const canView=viewer?.sub===user.id||user.privacy==="public"||isFollowing;
    const ownPrivacy=viewer?.sub===user.id?db.prepare(`SELECT dmPolicy,followPolicy,commentPolicy,mentionPolicy FROM profiles WHERE userId=?`).get(user.id) as Record<string,unknown>:{};
    return ok({ ...user, ...ownPrivacy, bio:canView?user.bio:null, location:canView?user.location:null, skills:canView?user.skills:null, followerCount, followingCount, postCount, isFollowing, requested, canView, isSelf: viewer?.sub === user.id });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const session = await requireUser();
    const { username } = await params;

    const target = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username) as
      | { id: string }
      | undefined;
    if (!target) throw new ApiError("not_found", "User not found.", 404);
    if (target.id !== session.sub) {
      throw new ApiError("forbidden", "You can only edit your own profile.", 403);
    }

    const body = updateProfileSchema.parse(await request.json());
    if(body.avatarUrl)assertOwnedMedia(session.sub,body.avatarUrl);
    const fields = Object.entries(body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return ok({ updated: false });

    const setClause = fields.map(([k]) => `${k} = ?`).join(", ");
    const values = fields.map(([, v]) => v);
    db.prepare(`UPDATE profiles SET ${setClause}, updatedAt = datetime('now') WHERE userId = ?`).run(
      ...values,
      target.id
    );

    return ok({ updated: true });
  } catch (err) {
    return handleError(err);
  }
}
