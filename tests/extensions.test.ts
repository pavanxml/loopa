import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { haversineKm } from "../src/lib/geo";
import { notifyIfEnabled } from "../src/lib/notifications";
import { storageService, MediaValidationError } from "../src/services/storage";
import { connectionRequestSchema, createEventSchema } from "../src/lib/validation";

describe("haversine distance", () => {
  it("returns ~0 for the same point", () => {
    expect(haversineKm(17.385, 78.4867, 17.385, 78.4867)).toBeCloseTo(0, 3);
  });

  it("matches the known Hyderabad–Bengaluru distance within a few km", () => {
    // Hyderabad (17.3850, 78.4867) to Bengaluru (12.9716, 77.5946) is
    // approximately 500 km great-circle distance.
    const km = haversineKm(17.385, 78.4867, 12.9716, 77.5946);
    expect(km).toBeGreaterThan(480);
    expect(km).toBeLessThan(520);
  });

  it("is symmetric", () => {
    const a = haversineKm(17.385, 78.4867, 12.9716, 77.5946);
    const b = haversineKm(12.9716, 77.5946, 17.385, 78.4867);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("notification preferences", () => {
  const sfx = randomUUID().slice(0, 8);
  const recipientId = randomUUID();
  const actorId = randomUUID();

  beforeAll(() => {
    for (const [id, name] of [[recipientId, "recip"], [actorId, "actor"]] as const) {
      db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
        .run(id, `${name}_${sfx}@t.loopa`, `${name}_${sfx}`);
      db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, ?)`).run(randomUUID(), id, name);
    }
  });

  it("creates a notification when no preference row exists (default = enabled)", () => {
    const before = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(recipientId) as { c: number }).c;
    notifyIfEnabled(recipientId, actorId, "like", "post", randomUUID());
    const after = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(recipientId) as { c: number }).c;
    expect(after).toBe(before + 1);
  });

  it("suppresses a notification type the user disabled", () => {
    db.prepare(`INSERT INTO notification_preferences (userId, likes) VALUES (?, 0)`).run(recipientId);
    const before = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(recipientId) as { c: number }).c;
    notifyIfEnabled(recipientId, actorId, "like", "post", randomUUID());
    const after = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(recipientId) as { c: number }).c;
    expect(after).toBe(before); // unchanged — suppressed
  });

  it("still delivers other, non-disabled types", () => {
    const before = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ? AND type='comment'`).get(recipientId) as { c: number }).c;
    notifyIfEnabled(recipientId, actorId, "comment", "post", randomUUID());
    const after = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ? AND type='comment'`).get(recipientId) as { c: number }).c;
    expect(after).toBe(before + 1);
  });

  it("never suppresses moderation_action even if disabled", () => {
    db.prepare(`UPDATE notification_preferences SET moderation_action = 0 WHERE userId = ?`).run(recipientId);
    const before = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ? AND type='moderation_action'`).get(recipientId) as { c: number }).c;
    notifyIfEnabled(recipientId, actorId, "moderation_action", "user", recipientId);
    const after = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ? AND type='moderation_action'`).get(recipientId) as { c: number }).c;
    expect(after).toBe(before + 1); // delivered anyway
  });

  it("never notifies a user about their own action", () => {
    const before = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(actorId) as { c: number }).c;
    notifyIfEnabled(actorId, actorId, "like", "post", randomUUID());
    const after = (db.prepare(`SELECT COUNT(*) c FROM notifications WHERE recipientId = ?`).get(actorId) as { c: number }).c;
    expect(after).toBe(before);
  });
});

describe("connections", () => {
  it("validates a well-formed request", () => {
    expect(connectionRequestSchema.safeParse({ username: "someone" }).success).toBe(true);
    expect(connectionRequestSchema.safeParse({ username: "" }).success).toBe(false);
  });

  it("prevents duplicate connection rows between the same two users", () => {
    const a = randomUUID();
    const b = randomUUID();
    for (const id of [a, b]) {
      db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
        .run(id, `${id}@t.loopa`, id.slice(0, 12));
      db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, 'X')`).run(randomUUID(), id);
    }
    db.prepare(`INSERT INTO connections (id, requesterId, addresseeId) VALUES (?, ?, ?)`)
      .run(randomUUID(), a, b);
    expect(() =>
      db.prepare(`INSERT INTO connections (id, requesterId, addresseeId) VALUES (?, ?, ?)`)
        .run(randomUUID(), a, b)
    ).toThrow();
  });

  it("transitions from pending to accepted", () => {
    const a = randomUUID(), b = randomUUID();
    const connId = randomUUID();
    for (const id of [a, b]) {
      db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
        .run(id, `${id}@t.loopa`, id.slice(0, 12));
    }
    db.prepare(`INSERT INTO connections (id, requesterId, addresseeId) VALUES (?, ?, ?)`).run(connId, a, b);
    db.prepare(`UPDATE connections SET status = 'accepted', respondedAt = datetime('now') WHERE id = ?`).run(connId);
    const row = db.prepare(`SELECT status FROM connections WHERE id = ?`).get(connId) as { status: string };
    expect(row.status).toBe("accepted");
  });
});

describe("full-text search (FTS5)", () => {
  const sfx = randomUUID().slice(0, 8);
  const authorId = randomUUID();

  beforeAll(() => {
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(authorId, `fts_${sfx}@t.loopa`, `fts_${sfx}`);
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, 'FTS Author')`).run(randomUUID(), authorId);

    const posts = [
      { body: `Deep dive into database performance tuning ${sfx}` },
      { body: `A completely unrelated post about kayaking ${sfx}` },
      { body: `More database internals and query planning ${sfx}` },
    ];
    for (const p of posts) {
      const id = randomUUID();
      db.prepare(`INSERT INTO posts (id, authorId, type, body) VALUES (?, ?, 'text', ?)`).run(id, authorId, p.body);
      db.prepare(`INSERT INTO posts_fts (postId, body) VALUES (?, ?)`).run(id, p.body);
    }
  });

  it("finds posts matching a term via MATCH, not substring scanning of unrelated posts", () => {
    const rows = db.prepare(
      `SELECT p.body FROM posts_fts f JOIN posts p ON p.id = f.postId WHERE posts_fts MATCH ? AND p.authorId = ?`
    ).all(`database*`, authorId) as { body: string }[];
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.body.toLowerCase().includes("database"))).toBe(true);
  });

  it("does not match posts lacking the term", () => {
    const rows = db.prepare(
      `SELECT p.body FROM posts_fts f JOIN posts p ON p.id = f.postId WHERE posts_fts MATCH ? AND p.authorId = ?`
    ).all(`kayaking*`, authorId) as { body: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.body).toContain("kayaking");
  });

  it("ranks results with bm25 without erroring", () => {
    const rows = db.prepare(
      `SELECT p.body, bm25(posts_fts) as score FROM posts_fts f JOIN posts p ON p.id = f.postId
       WHERE posts_fts MATCH ? AND p.authorId = ? ORDER BY bm25(posts_fts) ASC`
    ).all(`database*`, authorId) as { body: string; score: number }[];
    expect(rows.length).toBe(2);
    expect(typeof rows[0]?.score).toBe("number");
  });
});

describe("media upload validation", () => {
  it("rejects an unsupported image mime type", async () => {
    const buffer = Buffer.from("not-a-real-image");
    await expect(
      storageService.upload({ buffer, mimeType: "image/svg+xml", kind: "image" })
    ).rejects.toBeInstanceOf(MediaValidationError);
  });

  it("rejects an image exceeding the size limit", async () => {
    const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB > 10MB limit
    await expect(
      storageService.upload({ buffer, mimeType: "image/png", kind: "image" })
    ).rejects.toThrow(/exceeds/);
  });

  it("accepts a valid small image and returns a usable url", async () => {
    const sharp=(await import("sharp")).default;
    const buffer=await sharp({create:{width:16,height:16,channels:3,background:"red"}}).png().toBuffer();
    const result = await storageService.upload({ buffer, mimeType: "image/png", kind: "image" });
    expect(result.url).toMatch(/^\/api\/media\//);
    expect(result.storageKey).toBeTruthy();
    await storageService.delete(result.storageKey); // cleanup
  });
});

describe("thumbnail pipeline (real sharp + ffmpeg, no mocks)", () => {
  it("reads true dimensions and writes a real, smaller thumbnail for images", async () => {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 120, b: 200 } },
    }).jpeg().toBuffer();

    const result = await storageService.upload({ buffer, mimeType: "image/jpeg", kind: "image" });
    try {
      expect(result.width).toBe(1200);
      expect(result.height).toBe(800);
      expect(result.thumbnailUrl).toMatch(/_thumb\.jpg$/);

      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const thumb = await sharp(
        await fs.readFile(path.resolve(process.env.UPLOAD_DIR??".data/uploads",result.thumbnailUrl!.replace("/api/media/","")))
      ).metadata();
      expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(480);
      expect(thumb.width! / thumb.height!).toBeCloseTo(1200 / 800, 1); // aspect ratio preserved
    } finally {
      await storageService.delete(result.storageKey);
    }
  });

  it("rejects an undecodable file even if its claimed MIME type is an image", async () => {
    await expect(storageService.upload({
      buffer: Buffer.from("definitely not a png"), mimeType: "image/png", kind: "image",
    })).rejects.toBeInstanceOf(MediaValidationError);
  });

  it("probes duration/dimensions and extracts a poster frame for video", async () => {
    const { spawnSync } = await import("node:child_process");
    const fs = await import("node:fs/promises");
    const probe = spawnSync("ffmpeg", ["-version"]);
    if (probe.error) return; // ffmpeg absent on this host: the pipeline degrades by design

    const tmp = "/tmp/loopa-test-video.mp4";
    const gen = spawnSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:duration=2:rate=10",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", tmp, "-loglevel", "error",
    ]);
    expect(gen.status).toBe(0);

    const result = await storageService.upload({
      buffer: await fs.readFile(tmp), mimeType: "video/mp4", kind: "video",
    });
    try {
      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
      expect(result.durationMs).toBeGreaterThanOrEqual(1900);
      expect(result.durationMs).toBeLessThanOrEqual(2100);
      expect(result.thumbnailUrl).toMatch(/_thumb\.jpg$/);
    } finally {
      await storageService.delete(result.storageKey);
    }
  });
});

describe("event geolocation", () => {
  const base = {
    title: "Geo event", mode: "offline" as const, location: "Somewhere",
    startAt: new Date(Date.now() + 86400000).toISOString(),
  };
  it("accepts coordinates given as a pair", () => {
    expect(createEventSchema.safeParse({ ...base, latitude: 17.4, longitude: 78.4 }).success).toBe(true);
  });
  it("rejects a lone latitude or longitude", () => {
    expect(createEventSchema.safeParse({ ...base, latitude: 17.4 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, longitude: 78.4 }).success).toBe(false);
  });
  it("rejects out-of-range coordinates", () => {
    expect(createEventSchema.safeParse({ ...base, latitude: 91, longitude: 0 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, latitude: 0, longitude: 181 }).success).toBe(false);
  });
  it("still accepts events with no coordinates at all", () => {
    expect(createEventSchema.safeParse(base).success).toBe(true);
  });
});
