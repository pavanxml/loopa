import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { haversineKm } from "@/lib/geo";
import { filterVisiblePosts,filterVisibleEvents,safePeople,visibleHashtags } from "@/lib/postAccess";

/**
 * Discovery surfaces. Each tab is a distinct strategy, not a filter on one
 * list — this is the seam where a real recommender would slot in later.
 */
export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    const tab = new URL(request.url).searchParams.get("tab") ?? "for_you";

    if (tab === "people") {
      // Suggested people: friends-of-friends first (mutual connections),
      // then popular accounts, always excluding self, existing follows, and blocks.
      const items = viewer
        ? db.prepare(
            `SELECT u.username, p.displayName, p.avatarUrl, p.bio,
                    (SELECT COUNT(*) FROM follows WHERE followingId = u.id) as followerCount,
                    (SELECT COUNT(*) FROM follows f1
                      JOIN follows f2 ON f1.followingId = f2.followerId
                      WHERE f1.followerId = ? AND f2.followingId = u.id) as mutualCount
             FROM users u JOIN profiles p ON p.userId = u.id
             WHERE u.id != ? AND u.status = 'active'
               AND u.id NOT IN (SELECT followingId FROM follows WHERE followerId = ?)
               AND u.id NOT IN (SELECT blockedId FROM blocks WHERE blockingId = ?)
               AND u.id NOT IN (SELECT blockingId FROM blocks WHERE blockedId = ?)
             ORDER BY mutualCount DESC, followerCount DESC LIMIT 20`
          ).all(viewer.sub, viewer.sub, viewer.sub, viewer.sub, viewer.sub)
        : db.prepare(
            `SELECT u.username, p.displayName, p.avatarUrl, p.bio,
                    (SELECT COUNT(*) FROM follows WHERE followingId = u.id) as followerCount,
                    0 as mutualCount
             FROM users u JOIN profiles p ON p.userId = u.id
             WHERE u.status = 'active' ORDER BY followerCount DESC LIMIT 20`
          ).all();
      return ok({ tab, items:safePeople(items,viewer?.sub??null) });
    }

    if (tab === "communities") {
      const items = db.prepare(
        `SELECT slug, name, description, iconUrl, memberCount, privacy
         FROM communities WHERE deletedAt IS NULL AND privacy != 'invite_only'
         ORDER BY memberCount DESC, createdAt DESC LIMIT 20`
      ).all();
      return ok({ tab, items });
    }

    if (tab === "trending") {
      // Trending = engagement concentrated in the last 48h, not all-time totals.
      const items = db.prepare(
        `SELECT p.id, p.body, p.createdAt, p.likeCount, p.commentCount,
                u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
         FROM posts p JOIN users u ON u.id = p.authorId JOIN profiles pr ON pr.userId = p.authorId
         WHERE p.status = 'published' AND p.deletedAt IS NULL AND p.visibility = 'public'
           AND p.createdAt > datetime('now', '-48 hours')
         ORDER BY (p.likeCount + p.commentCount * 2 + p.shareCount * 3) DESC LIMIT 20`
      ).all();
      return ok({ tab, items:filterVisiblePosts(items,viewer?.sub??null) });
    }

    if (tab === "topics") {
      const items = visibleHashtags(viewer?.sub??null,30);
      return ok({ tab, items });
    }

    if (tab === "nearby") {
      if (!viewer) return ok({ tab, items: [], note: "Sign in to see what's nearby." });
      const profile = db.prepare(`SELECT location, latitude, longitude FROM profiles WHERE userId = ?`)
        .get(viewer.sub) as { location: string | null; latitude: number | null; longitude: number | null } | undefined;

      // Real distance when the viewer has shared coordinates (opt-in via
      // "Use my location" in profile settings) — ranked by actual km, not a
      // stand-in for it. Falls back to a text match on city when they haven't.
      if (profile?.latitude != null && profile.longitude != null) {
        const candidates = db.prepare(
          `SELECT u.username, p.displayName, p.avatarUrl, p.bio, p.location, p.latitude, p.longitude
           FROM users u JOIN profiles p ON p.userId = u.id
           WHERE u.id != ? AND u.status = 'active' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`
        ).all(viewer.sub) as { username: string; displayName: string; avatarUrl: string | null;
                                bio: string | null; location: string | null; latitude: number; longitude: number }[];

        const withDistance = candidates
          .map((c) => ({
            username: c.username, displayName: c.displayName, avatarUrl: c.avatarUrl,
            bio: c.bio, location: c.location,
            distanceKm: Math.round(haversineKm(profile.latitude!, profile.longitude!, c.latitude, c.longitude)),
          }))
          .filter((c) => c.distanceKm <= 150)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 20);

        return ok({ tab, items: safePeople(withDistance,viewer.sub).filter(p=>p.distanceKm!=null), method: "coordinates" });
      }

      if (!profile?.location) {
        return ok({ tab, items: [], note: "Add a location to your profile to see nearby people and events." });
      }
      const city = profile.location.split(",")[0]!.trim();
      const items = db.prepare(
        `SELECT u.username, p.displayName, p.avatarUrl, p.bio, p.location
         FROM users u JOIN profiles p ON p.userId = u.id
         WHERE u.id != ? AND u.status = 'active' AND p.location LIKE ? LIMIT 20`
      ).all(viewer.sub, `%${city}%`);
      return ok({ tab, items:safePeople(items,viewer.sub).filter(p=>p.location!=null), method: "text_match" });
    }

    // for_you — a mixed shelf so discovery isn't just one content type
    const trendingPosts = db.prepare(
      `SELECT p.id, p.body, p.createdAt, p.likeCount, p.commentCount,
              u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
       FROM posts p JOIN users u ON u.id = p.authorId JOIN profiles pr ON pr.userId = p.authorId
       WHERE p.status = 'published' AND p.deletedAt IS NULL AND p.visibility = 'public'
       ORDER BY (p.likeCount + p.commentCount * 2) DESC LIMIT 10`
    ).all();
    const communities = db.prepare(
      `SELECT slug, name, description, iconUrl, memberCount FROM communities
       WHERE deletedAt IS NULL AND privacy = 'public' ORDER BY memberCount DESC LIMIT 5`
    ).all();
    const events = db.prepare(
      `SELECT id, title, startAt, mode, location, attendeeCount FROM events
       WHERE status = 'scheduled' AND startAt > datetime('now') ORDER BY attendeeCount DESC LIMIT 5`
    ).all();
    const topics = visibleHashtags(viewer?.sub??null,10);

    return ok({ tab: "for_you", posts: filterVisiblePosts(trendingPosts,viewer?.sub??null), communities, events:filterVisibleEvents(events,viewer?.sub??null), topics });
  } catch (err) {
    return handleError(err);
  }
}
