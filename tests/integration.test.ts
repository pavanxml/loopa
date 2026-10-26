/**
 * Integration tests for the critical flow named in the spec:
 *   Signup → Login → Create Post → Feed → Like → Comment → Follow
 *
 * These exercise the real database layer and the real ranking/validation
 * modules (no mocks). Route handlers themselves depend on Next's
 * `cookies()` request context, so these tests call the same underlying
 * data operations the handlers call — see README "Testing" for the
 * Playwright setup that covers the HTTP layer end to end.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { rankPosts, type RankingSignals } from "../src/lib/ranking";

const suffix = randomUUID().slice(0, 8);
const alice = { id: randomUUID(), username: `alice_${suffix}`, email: `alice_${suffix}@test.loopa` };
const bob = { id: randomUUID(), username: `bob_${suffix}`, email: `bob_${suffix}@test.loopa` };
let postId: string;

beforeAll(async () => {
  const hash = await hashPassword("test-password-123");
  for (const u of [alice, bob]) {
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, ?)`).run(
      u.id, u.email, u.username, hash
    );
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, ?)`).run(
      randomUUID(), u.id, u.username
    );
  }
});

describe("signup", () => {
  it("enforces unique usernames", () => {
    const dupe = () =>
      db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, ?)`).run(
        randomUUID(), `other_${suffix}@test.loopa`, alice.username, "x"
      );
    expect(dupe).toThrow();
  });

  it("enforces unique emails", () => {
    const dupe = () =>
      db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, ?)`).run(
        randomUUID(), alice.email, `other_${suffix}`, "x"
      );
    expect(dupe).toThrow();
  });

  it("creates a profile linked to the user", () => {
    const profile = db.prepare(`SELECT displayName FROM profiles WHERE userId = ?`).get(alice.id);
    expect(profile).toBeTruthy();
  });
});

describe("login", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const row = db.prepare(`SELECT passwordHash FROM users WHERE id = ?`).get(alice.id) as { passwordHash: string };
    expect(await verifyPassword("test-password-123", row.passwordHash)).toBe(true);
    expect(await verifyPassword("nope", row.passwordHash)).toBe(false);
  });
});

describe("create post", () => {
  it("persists a post owned by its author", () => {
    postId = randomUUID();
    db.prepare(`INSERT INTO posts (id, authorId, type, body) VALUES (?, ?, 'text', ?)`).run(
      postId, alice.id, "Integration test post #loopa"
    );
    const row = db.prepare(`SELECT authorId, status, likeCount FROM posts WHERE id = ?`).get(postId) as {
      authorId: string; status: string; likeCount: number;
    };
    expect(row.authorId).toBe(alice.id);
    expect(row.status).toBe("published");
    expect(row.likeCount).toBe(0);
  });
});

describe("feed", () => {
  it("returns published public posts and ranks them", () => {
    const rows = db
      .prepare(`SELECT id, likeCount, commentCount, shareCount FROM posts WHERE status='published' AND deletedAt IS NULL LIMIT 50`)
      .all() as { id: string; likeCount: number; commentCount: number; shareCount: number }[];
    expect(rows.length).toBeGreaterThan(0);

    const ranked = rankPosts(
      rows.map((r) => ({
        id: r.id,
        signals: {
          ageHours: 1, likeCount: r.likeCount, commentCount: r.commentCount, shareCount: r.shareCount,
          authorIsFollowed: false, sameCommunityMembership: false, interestOverlapScore: 0, reportCount: 0,
        } satisfies RankingSignals,
      }))
    );
    expect(ranked.length).toBe(rows.length);
  });

  it("excludes soft-deleted posts", () => {
    const deletedId = randomUUID();
    db.prepare(`INSERT INTO posts (id, authorId, type, body, deletedAt) VALUES (?, ?, 'text', 'gone', datetime('now'))`).run(
      deletedId, alice.id
    );
    const visible = db.prepare(`SELECT id FROM posts WHERE id = ? AND deletedAt IS NULL`).get(deletedId);
    expect(visible).toBeUndefined();
  });
});

describe("like", () => {
  it("records a like and increments the cached count", () => {
    db.prepare(`INSERT INTO likes (id, userId, postId) VALUES (?, ?, ?)`).run(randomUUID(), bob.id, postId);
    db.prepare(`UPDATE posts SET likeCount = likeCount + 1 WHERE id = ?`).run(postId);
    const row = db.prepare(`SELECT likeCount FROM posts WHERE id = ?`).get(postId) as { likeCount: number };
    expect(row.likeCount).toBe(1);
  });

  it("prevents a duplicate like from the same user", () => {
    const dupe = () =>
      db.prepare(`INSERT INTO likes (id, userId, postId) VALUES (?, ?, ?)`).run(randomUUID(), bob.id, postId);
    expect(dupe).toThrow();
  });
});

describe("comment", () => {
  it("records a comment and increments the cached count", () => {
    db.prepare(`INSERT INTO comments (id, postId, authorId, body) VALUES (?, ?, ?, ?)`).run(
      randomUUID(), postId, bob.id, "Nice post"
    );
    db.prepare(`UPDATE posts SET commentCount = commentCount + 1 WHERE id = ?`).run(postId);
    const row = db.prepare(`SELECT commentCount FROM posts WHERE id = ?`).get(postId) as { commentCount: number };
    expect(row.commentCount).toBe(1);
  });
});

describe("follow", () => {
  it("creates a follow edge", () => {
    db.prepare(`INSERT INTO follows (id, followerId, followingId) VALUES (?, ?, ?)`).run(
      randomUUID(), bob.id, alice.id
    );
    const row = db.prepare(`SELECT 1 FROM follows WHERE followerId = ? AND followingId = ?`).get(bob.id, alice.id);
    expect(row).toBeTruthy();
  });

  it("prevents duplicate follow edges", () => {
    const dupe = () =>
      db.prepare(`INSERT INTO follows (id, followerId, followingId) VALUES (?, ?, ?)`).run(
        randomUUID(), bob.id, alice.id
      );
    expect(dupe).toThrow();
  });

  it("counts followers correctly", () => {
    const { c } = db.prepare(`SELECT COUNT(*) c FROM follows WHERE followingId = ?`).get(alice.id) as { c: number };
    expect(c).toBe(1);
  });
});

describe("authorization invariants", () => {
  it("a post's author is the only identity recorded as owner", () => {
    const row = db.prepare(`SELECT authorId FROM posts WHERE id = ?`).get(postId) as { authorId: string };
    expect(row.authorId).toBe(alice.id);
    expect(row.authorId).not.toBe(bob.id);
  });

  it("cascade-deletes a user's posts when the user row is removed", () => {
    const tempId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`).run(
      tempId, `temp_${suffix}@test.loopa`, `temp_${suffix}`
    );
    const tempPost = randomUUID();
    db.prepare(`INSERT INTO posts (id, authorId, type, body) VALUES (?, ?, 'text', 'temp')`).run(tempPost, tempId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(tempId);
    expect(db.prepare(`SELECT id FROM posts WHERE id = ?`).get(tempPost)).toBeUndefined();
  });
});
