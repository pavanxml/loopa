import { NextRequest } from "next/server";
import { db,transaction } from "@/lib/db";
import { filterVisibleEvents } from "@/lib/postAccess";
import { newId } from "@/lib/id";
import { createEventSchema, cursorPaginationSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/session";
import { requireRole } from "@/lib/permissions";
import { haversineKm } from "@/lib/geo";

/**
 * Event discovery. `scope` selects a discovery strategy rather than a filter:
 *   upcoming    — soonest first
 *   popular     — most attendees among future events
 *   community   — events from communities the viewer belongs to
 *   recommended — blends community membership and interest-category overlap
 *   nearby      — matches the viewer's profile location (a real deployment
 *                 would use PostGIS/geohash; profile-location matching is the
 *                 honest MVP, not a fake distance calculation)
 */
export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "upcoming";
    const { limit } = cursorPaginationSchema.parse({ limit: searchParams.get("limit") ?? undefined });

    const SELECT = `SELECT e.id, e.title, e.description, e.coverUrl, e.category, e.mode, e.location,
                           e.startAt, e.endAt, e.capacity, e.attendeeCount,
                           u.username as hostUsername, pr.displayName as hostDisplayName,
                           c.slug as communitySlug, c.name as communityName
                    FROM events e
                    JOIN users u ON u.id = e.hostId
                    JOIN profiles pr ON pr.userId = e.hostId
                    LEFT JOIN communities c ON c.id = e.communityId
                    WHERE e.status = 'scheduled' AND e.startAt > datetime('now')`;

    let rows: unknown[];
    if (scope === "popular") {
      rows = db.prepare(`${SELECT} ORDER BY e.attendeeCount DESC, e.startAt ASC LIMIT ?`).all(limit);
    } else if (scope === "community" && viewer) {
      rows = db.prepare(
        `${SELECT} AND e.communityId IN (
           SELECT communityId FROM community_members WHERE userId = ? AND status = 'active'
         ) ORDER BY e.startAt ASC LIMIT ?`
      ).all(viewer.sub, limit);
    } else if (scope === "nearby" && viewer) {
      const profile = db.prepare(`SELECT location, latitude, longitude FROM profiles WHERE userId = ?`).get(viewer.sub) as
        | { location: string | null; latitude: number | null; longitude: number | null } | undefined;

      if (profile?.latitude != null && profile.longitude != null) {
        // Real great-circle distance against event pins. Events whose host
        // set no pin aren't ranked here (no coordinates = no honest distance).
        const geo = db.prepare(
          `${SELECT.replace("e.startAt,", "e.startAt, e.latitude as evLat, e.longitude as evLng,")}
           AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL`
        ).all() as (Record<string, unknown> & { evLat: number; evLng: number })[];

        rows = geo
          .map(({ evLat, evLng, ...rest }) => ({
            ...rest,
            distanceKm: Math.round(haversineKm(profile.latitude!, profile.longitude!, evLat, evLng)),
          }))
          .filter((e) => e.distanceKm <= 150)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, limit);
      } else if (!profile?.location) {
        return ok({ items: [], scope, note: "Add a location to your profile to see nearby events." });
      } else {
        const city = profile.location.split(",")[0]!.trim();
        rows = db.prepare(`${SELECT} AND e.location LIKE ? ORDER BY e.startAt ASC LIMIT ?`).all(`%${city}%`, limit);
      }
    } else if (scope === "recommended" && viewer) {
      rows = db.prepare(
        `${SELECT}
         ORDER BY
           (CASE WHEN e.communityId IN (
              SELECT communityId FROM community_members WHERE userId = ? AND status = 'active'
            ) THEN 2 ELSE 0 END)
         + (CASE WHEN e.category IN (SELECT topic FROM user_interests WHERE userId = ?) THEN 3 ELSE 0 END)
         + (e.attendeeCount / 50.0) DESC,
           e.startAt ASC
         LIMIT ?`
      ).all(viewer.sub, viewer.sub, limit);
    } else {
      rows = db.prepare(`${SELECT} ORDER BY e.startAt ASC LIMIT ?`).all(limit);
    }

    let attending = new Set<string>();
    if (viewer && rows.length > 0) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      const ph = ids.map(() => "?").join(",");
      const going = db
        .prepare(`SELECT eventId FROM event_attendees WHERE userId = ? AND eventId IN (${ph})`)
        .all(viewer.sub, ...ids) as { eventId: string }[];
      attending = new Set(going.map((g) => g.eventId));
    }

    const items = (rows as Record<string, unknown>[]).map((r) => ({
      ...r, isAttending: attending.has(r.id as string),
    }));
    return ok({ items:filterVisibleEvents(items,viewer?.sub??null), scope });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = createEventSchema.parse(await request.json());

    // Community events require at least moderator rights in that community.
    if (body.communityId) {
      requireRole(body.communityId, session.sub, "moderator");
    }
    if (new Date(body.startAt) < new Date()) {
      throw new ApiError("validation_error", "Events can't start in the past.", 422);
    }

    const id = newId();
    transaction(()=>{
    db.prepare(
      `INSERT INTO events (id, hostId, communityId, title, description, category, mode, location, onlineUrl, latitude, longitude, startAt, endAt, capacity, attendeeCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, session.sub, body.communityId ?? null, body.title, body.description ?? null, body.category ?? null,
          body.mode, body.location ?? null, body.onlineUrl ?? null, body.latitude ?? null, body.longitude ?? null,
          body.startAt, body.endAt ?? null, body.capacity ?? null);

    // The host is automatically the first attendee.
    db.prepare(`INSERT INTO event_attendees (id, eventId, userId, status) VALUES (?, ?, ?, 'going')`)
      .run(newId(), id, session.sub);
    });

    return ok({ id }, 201);
  } catch (err) {
    return handleError(err);
  }
}
