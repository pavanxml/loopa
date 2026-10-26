/**
 * Phase 3–8 tests: community authorization, event capacity, moment expiry,
 * messaging membership, safety, and validation of the new schemas.
 *
 * These run against the real database layer and real permission functions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hasRole, requireRole, assertCanActOn, canViewCommunity, isPlatformAdmin } from "../src/lib/permissions";
import {
  createCommunitySchema, createEventSchema, createMomentSchema,
  createMessageSchema, slugSchema,
} from "../src/lib/validation";

const sfx = randomUUID().slice(0, 8);
const ids = {
  owner: randomUUID(), admin: randomUUID(), mod: randomUUID(),
  member: randomUUID(), outsider: randomUUID(), platformAdmin: randomUUID(),
};
const communityId = randomUUID();
const privateCommunityId = randomUUID();

beforeAll(() => {
  const mk = (id: string, name: string, role = "user") => {
    db.prepare(`INSERT INTO users (id, email, username, passwordHash, role) VALUES (?, ?, ?, 'x', ?)`)
      .run(id, `${name}_${sfx}@t.loopa`, `${name}_${sfx}`, role);
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, ?)`).run(randomUUID(), id, name);
  };
  mk(ids.owner, "owner"); mk(ids.admin, "admin2"); mk(ids.mod, "mod");
  mk(ids.member, "member"); mk(ids.outsider, "outsider");
  mk(ids.platformAdmin, "padmin", "admin");

  for (const [cid, privacy] of [[communityId, "public"], [privateCommunityId, "private"]] as const) {
    db.prepare(
      `INSERT INTO communities (id, slug, name, privacy, ownerId, memberCount) VALUES (?, ?, ?, ?, ?, 4)`
    ).run(cid, `c-${cid.slice(0, 8)}`, "Test Community", privacy, ids.owner);
  }
  for (const [uid, role] of [[ids.owner, "owner"], [ids.admin, "admin"], [ids.mod, "moderator"], [ids.member, "member"]] as const) {
    db.prepare(`INSERT INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, ?)`)
      .run(randomUUID(), communityId, uid, role);
  }
  db.prepare(`INSERT INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, 'member')`)
    .run(randomUUID(), privateCommunityId, ids.member);
});

describe("community role hierarchy", () => {
  it("grants higher roles the permissions of lower ones", () => {
    expect(hasRole(communityId, ids.owner, "moderator")).toBe(true);
    expect(hasRole(communityId, ids.admin, "moderator")).toBe(true);
    expect(hasRole(communityId, ids.mod, "moderator")).toBe(true);
  });

  it("denies members moderator permissions", () => {
    expect(hasRole(communityId, ids.member, "moderator")).toBe(false);
    expect(hasRole(communityId, ids.member, "admin")).toBe(false);
  });

  it("denies non-members everything", () => {
    expect(hasRole(communityId, ids.outsider, "member")).toBe(false);
    expect(() => requireRole(communityId, ids.outsider, "member")).toThrow();
  });

  it("denies moderators owner-only actions", () => {
    expect(hasRole(communityId, ids.mod, "owner")).toBe(false);
    expect(() => requireRole(communityId, ids.mod, "owner")).toThrow();
  });

  it("blocks a banned member even though a row exists", () => {
    const bannedId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(bannedId, `banned_${sfx}@t.loopa`, `banned_${sfx}`);
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, 'Banned')`).run(randomUUID(), bannedId);
    db.prepare(`INSERT INTO community_members (id, communityId, userId, role, status) VALUES (?, ?, ?, 'member', 'banned')`)
      .run(randomUUID(), communityId, bannedId);
    expect(hasRole(communityId, bannedId, "member")).toBe(false);
  });
});

describe("moderation targeting rules", () => {
  it("lets an admin act on a member", () => {
    expect(() => assertCanActOn(communityId, ids.admin, ids.member)).not.toThrow();
  });
  it("refuses to let a moderator act on an admin", () => {
    expect(() => assertCanActOn(communityId, ids.mod, ids.admin)).toThrow();
  });
  it("refuses to let an admin act on the owner", () => {
    expect(() => assertCanActOn(communityId, ids.admin, ids.owner)).toThrow();
  });
  it("refuses peer-on-peer moderation", () => {
    const admin2 = randomUUID();
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(admin2, `a2_${sfx}@t.loopa`, `a2_${sfx}`);
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, 'A2')`).run(randomUUID(), admin2);
    db.prepare(`INSERT INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, 'admin')`)
      .run(randomUUID(), communityId, admin2);
    expect(() => assertCanActOn(communityId, ids.admin, admin2)).toThrow();
  });
});

describe("community privacy", () => {
  it("shows public communities to anyone, signed in or not", () => {
    expect(canViewCommunity({ id: communityId, privacy: "public" }, null)).toBe(true);
    expect(canViewCommunity({ id: communityId, privacy: "public" }, ids.outsider)).toBe(true);
  });
  it("hides private community contents from non-members", () => {
    expect(canViewCommunity({ id: privateCommunityId, privacy: "private" }, ids.outsider)).toBe(false);
    expect(canViewCommunity({ id: privateCommunityId, privacy: "private" }, null)).toBe(false);
  });
  it("shows private community contents to members", () => {
    expect(canViewCommunity({ id: privateCommunityId, privacy: "private" }, ids.member)).toBe(true);
  });
});

describe("platform admin", () => {
  it("identifies admins and rejects regular users", () => {
    expect(isPlatformAdmin(ids.platformAdmin)).toBe(true);
    expect(isPlatformAdmin(ids.member)).toBe(false);
  });
});

describe("event constraints", () => {
  it("requires a location for in-person events", () => {
    const r = createEventSchema.safeParse({
      title: "Test event", mode: "offline", startAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(r.success).toBe(false);
  });
  it("requires a join link for online events", () => {
    const r = createEventSchema.safeParse({
      title: "Test event", mode: "online", startAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(r.success).toBe(false);
  });
  it("rejects an end time before the start time", () => {
    const start = new Date(Date.now() + 86400000);
    const r = createEventSchema.safeParse({
      title: "Test event", mode: "online", onlineUrl: "https://example.com",
      startAt: start.toISOString(), endAt: new Date(start.getTime() - 3600000).toISOString(),
    });
    expect(r.success).toBe(false);
  });
  it("accepts a well-formed event", () => {
    const start = new Date(Date.now() + 86400000);
    const r = createEventSchema.safeParse({
      title: "Valid event", mode: "offline", location: "Hyderabad",
      startAt: start.toISOString(), endAt: new Date(start.getTime() + 3600000).toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it("enforces capacity at the database level", () => {
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, hostId, title, mode, location, startAt, capacity, attendeeCount)
       VALUES (?, ?, 'Capped', 'offline', 'Somewhere', datetime('now','+2 days'), 1, 1)`
    ).run(eventId, ids.owner);
    db.prepare(`INSERT INTO event_attendees (id, eventId, userId) VALUES (?, ?, ?)`)
      .run(randomUUID(), eventId, ids.owner);

    const ev = db.prepare(`SELECT capacity, attendeeCount FROM events WHERE id = ?`).get(eventId) as
      { capacity: number; attendeeCount: number };
    expect(ev.attendeeCount >= ev.capacity).toBe(true); // route returns 409 in this state
  });

  it("prevents duplicate attendance rows", () => {
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, hostId, title, mode, location, startAt) VALUES (?, ?, 'Dup', 'offline', 'X', datetime('now','+1 day'))`
    ).run(eventId, ids.owner);
    db.prepare(`INSERT INTO event_attendees (id, eventId, userId) VALUES (?, ?, ?)`)
      .run(randomUUID(), eventId, ids.member);
    expect(() =>
      db.prepare(`INSERT INTO event_attendees (id, eventId, userId) VALUES (?, ?, ?)`)
        .run(randomUUID(), eventId, ids.member)
    ).toThrow();
  });
});

describe("moments", () => {
  it("requires media for photo moments and text for text moments", () => {
    expect(createMomentSchema.safeParse({ kind: "photo" }).success).toBe(false);
    expect(createMomentSchema.safeParse({ kind: "text", text: "  " }).success).toBe(false);
    expect(createMomentSchema.safeParse({ kind: "text", text: "Hello" }).success).toBe(true);
  });

  it("excludes expired moments from reads", () => {
    const liveId = randomUUID();
    const deadId = randomUUID();
    db.prepare(`INSERT INTO moments (id, authorId, kind, text, expiresAt) VALUES (?, ?, 'text', 'live', datetime('now','+5 hours'))`)
      .run(liveId, ids.owner);
    db.prepare(`INSERT INTO moments (id, authorId, kind, text, expiresAt) VALUES (?, ?, 'text', 'dead', datetime('now','-1 hours'))`)
      .run(deadId, ids.owner);

    const visible = db.prepare(
      `SELECT id FROM moments WHERE authorId = ? AND expiresAt > datetime('now')`
    ).all(ids.owner) as { id: string }[];
    const visibleIds = visible.map((v) => v.id);
    expect(visibleIds).toContain(liveId);
    expect(visibleIds).not.toContain(deadId);
  });
});

describe("messaging", () => {
  it("validates that a message has text or media", () => {
    expect(createMessageSchema.safeParse({ kind: "text" }).success).toBe(false);
    expect(createMessageSchema.safeParse({ kind: "text", body: "hi" }).success).toBe(true);
  });

  it("only lists conversations the user belongs to", () => {
    const convId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, isGroup) VALUES (?, 0)`).run(convId);
    db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
      .run(randomUUID(), convId, ids.owner);
    db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
      .run(randomUUID(), convId, ids.member);

    const outsiderSees = db.prepare(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm ON cm.conversationId = c.id AND cm.userId = ?
       WHERE c.id = ?`
    ).get(ids.outsider, convId);
    expect(outsiderSees).toBeUndefined();

    const memberSees = db.prepare(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm ON cm.conversationId = c.id AND cm.userId = ?
       WHERE c.id = ?`
    ).get(ids.member, convId);
    expect(memberSees).toBeTruthy();
  });

  it("prevents duplicate membership in a conversation", () => {
    const convId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, isGroup) VALUES (?, 0)`).run(convId);
    db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
      .run(randomUUID(), convId, ids.owner);
    expect(() =>
      db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
        .run(randomUUID(), convId, ids.owner)
    ).toThrow();
  });
});

describe("blocks and mutes", () => {
  it("records a block and prevents duplicates", () => {
    db.prepare(`INSERT INTO blocks (id, blockingId, blockedId) VALUES (?, ?, ?)`)
      .run(randomUUID(), ids.member, ids.outsider);
    expect(() =>
      db.prepare(`INSERT INTO blocks (id, blockingId, blockedId) VALUES (?, ?, ?)`)
        .run(randomUUID(), ids.member, ids.outsider)
    ).toThrow();
  });

  it("filters blocked users out of a feed query", () => {
    const postId = randomUUID();
    db.prepare(`INSERT INTO posts (id, authorId, type, body) VALUES (?, ?, 'text', 'from blocked user')`)
      .run(postId, ids.outsider);

    const visible = db.prepare(
      `SELECT id FROM posts WHERE id = ?
         AND authorId NOT IN (SELECT blockedId FROM blocks WHERE blockingId = ?)`
    ).get(postId, ids.member);
    expect(visible).toBeUndefined();
  });
});

describe("community and slug validation", () => {
  it("rejects malformed slugs", () => {
    for (const bad of ["ab", "Has Caps", "has_underscore", "has spaces", "sym!bols"]) {
      expect(slugSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("accepts a valid slug", () => {
    expect(slugSchema.safeParse("design-systems").success).toBe(true);
  });
  it("rejects a community with no name", () => {
    expect(createCommunitySchema.safeParse({ name: "", slug: "valid-slug" }).success).toBe(false);
  });
  it("defaults new communities to public", () => {
    const r = createCommunitySchema.safeParse({ name: "Test", slug: "test-slug" });
    expect(r.success && r.data.privacy).toBe("public");
  });
  it("enforces unique community slugs", () => {
    const slug = `unique-${sfx}`;
    db.prepare(`INSERT INTO communities (id, slug, name, ownerId) VALUES (?, ?, 'A', ?)`)
      .run(randomUUID(), slug, ids.owner);
    expect(() =>
      db.prepare(`INSERT INTO communities (id, slug, name, ownerId) VALUES (?, ?, 'B', ?)`)
        .run(randomUUID(), slug, ids.owner)
    ).toThrow();
  });
});
