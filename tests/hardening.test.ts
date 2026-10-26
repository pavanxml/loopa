import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (jar.has(key) ? { value: jar.get(key) } : undefined),
    set: (key: string, value: string) => {
      if (value) jar.set(key, value);
      else jar.delete(key);
    },
    delete: (key: string) => jar.delete(key),
  }),
}));
import { db, transaction } from "../src/lib/db";
import {
  createSession,
  getCurrentUser,
  destroySession,
  refreshSession,
} from "../src/lib/session";
import {
  visiblePost,
  filterVisiblePosts,
  requireConversationAccess,
} from "../src/lib/postAccess";
import { updateProfileSchema, passwordSchema } from "../src/lib/validation";
import { GET as feed } from "../src/app/api/feed/route";
import { POST as follow } from "../src/app/api/users/[username]/follow/route";
import { PATCH as approve } from "../src/app/api/follow-requests/route";
import { POST as like } from "../src/app/api/posts/[id]/like/route";
import {
  POST as comment,
  GET as comments,
} from "../src/app/api/posts/[id]/comments/route";
import { middleware } from "../src/middleware";

function account(privacy = "public") {
  const id = randomUUID(),
    username = `u_${id.slice(0, 8)}`;
  db.prepare(
    `INSERT INTO users(id,email,username,passwordHash) VALUES(?,?,?,'x')`,
  ).run(id, `${username}@test.local`, username);
  db.prepare(
    `INSERT INTO profiles(id,userId,displayName,privacy) VALUES(?,?,?,?)`,
  ).run(randomUUID(), id, username, privacy);
  return { id, username, role: "user" };
}
function post(
  authorId: string,
  visibility = "public",
  communityId: string | null = null,
) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO posts(id,authorId,type,body,visibility,communityId,createdAt) VALUES(?,?,'text','test drop',?,?,?)`,
  ).run(id, authorId, visibility, communityId, new Date().toISOString());
  return id;
}
function request(path: string, body?: unknown) {
  return new NextRequest(
    `http://localhost:3000${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-loopa-request": "1",
          },
          body: JSON.stringify(body),
        },
  );
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("database transactions", () => {
  it("rolls back every write when a related operation fails", () => {
    const user = account();
    const id = randomUUID();
    expect(() =>
      transaction(() => {
        db.prepare(
          `INSERT INTO posts(id,authorId,type) VALUES(?,?,'text')`,
        ).run(id, user.id);
        throw new Error("abort");
      }),
    ).toThrow("abort");
    expect(
      db.prepare(`SELECT 1 FROM posts WHERE id=?`).get(id),
    ).toBeUndefined();
  });
});
describe("session revocation", () => {
  it("invalidates stolen access cookies immediately after logout", async () => {
    const user = account();
    await createSession(user);
    const stolen = jar.get("loopa_access")!;
    expect((await getCurrentUser())?.sub).toBe(user.id);
    await destroySession();
    jar.set("loopa_access", stolen);
    expect(await getCurrentUser()).toBeNull();
  });
  it("checks current account status on every request", async () => {
    const user = account();
    await createSession(user);
    db.prepare(`UPDATE users SET status='suspended' WHERE id=?`).run(user.id);
    expect(await getCurrentUser()).toBeNull();
  });
  it("rotates refresh credentials and revokes successors after replay", async () => {
    const user = account();
    await createSession(user);
    const old = jar.get("loopa_refresh")!;
    expect((await refreshSession())?.id).toBe(user.id);
    const newAccess = jar.get("loopa_access")!;
    expect(jar.get("loopa_refresh")).not.toBe(old);
    jar.set("loopa_refresh", old);
    expect(await refreshSession()).toBeNull();
    jar.set("loopa_access", newAccess);
    expect(await getCurrentUser()).toBeNull();
  });
  it("allows only one winner for simultaneous refresh requests", async () => {
    await createSession(account());
    const results = await Promise.all([refreshSession(), refreshSession()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
describe("private content authorization", () => {
  it("hides public posts from private accounts until a follow is approved", async () => {
    const owner = account("private"),
      viewer = account(),
      id = post(owner.id);
    expect(() => visiblePost(id, viewer.id)).toThrow();
    await createSession(viewer);
    const result = await follow(request("/api/users/follow", {}), {
      params: Promise.resolve({ username: owner.username }),
    });
    expect((await result.json()).data).toEqual({
      following: false,
      requested: true,
    });
    expect(() => visiblePost(id, viewer.id)).toThrow();
    const row = db
      .prepare(
        `SELECT id FROM follow_requests WHERE requesterId=? AND targetId=?`,
      )
      .get(viewer.id, owner.id) as { id: string };
    await createSession(owner);
    expect(
      (
        await approve(
          request("/api/follow-requests", { id: row.id, action: "accept" }),
        )
      ).status,
    ).toBe(200);
    expect(visiblePost(id, viewer.id).id).toBe(id);
  });
  it("applies private community visibility to direct and collection reads", () => {
    const owner = account(),
      viewer = account(),
      cid = randomUUID();
    db.prepare(
      `INSERT INTO communities(id,slug,name,ownerId,privacy) VALUES(?,?,?,?,'private')`,
    ).run(cid, cid, "Private club", owner.id);
    const id = post(owner.id, "public", cid);
    expect(() => visiblePost(id, viewer.id)).toThrow();
    expect(filterVisiblePosts([{ id, body: "secret" }], viewer.id)).toEqual([]);
  });
  it("honors friends-only posts and mutual blocks", () => {
    const owner = account(),
      viewer = account(),
      id = post(owner.id, "friends");
    expect(() => visiblePost(id, viewer.id)).toThrow();
    db.prepare(
      `INSERT INTO connections(id,requesterId,addresseeId,status) VALUES(?,?,?,'accepted')`,
    ).run(randomUUID(), owner.id, viewer.id);
    expect(visiblePost(id, viewer.id).id).toBe(id);
    db.prepare(`INSERT INTO blocks(id,blockingId,blockedId) VALUES(?,?,?)`).run(
      randomUUID(),
      owner.id,
      viewer.id,
    );
    expect(() => visiblePost(id, viewer.id)).toThrow();
  });
  it("denies likes and comment reads on another user's private post", async () => {
    const owner = account(),
      viewer = account(),
      id = post(owner.id, "private");
    await createSession(viewer);
    expect((await like(request("/like", {}), context(id))).status).toBe(404);
    expect((await comments(request("/comments"), context(id))).status).toBe(
      404,
    );
    expect(
      db.prepare(`SELECT COUNT(*) c FROM likes WHERE postId=?`).get(id),
    ).toMatchObject({ c: 0 });
  });
  it("rejects comment replies pointing at another post", async () => {
    const owner = account(),
      one = post(owner.id),
      two = post(owner.id),
      parent = randomUUID();
    db.prepare(
      `INSERT INTO comments(id,postId,authorId,body) VALUES(?,?,?,'private reply')`,
    ).run(parent, one, owner.id);
    await createSession(owner);
    expect(
      (
        await comment(
          request("/comments", { body: "reply", parentId: parent }),
          context(two),
        )
      ).status,
    ).toBe(422);
  });
  it("prevents blocked users from accessing existing conversations", () => {
    const one = account(),
      two = account(),
      cid = randomUUID();
    db.prepare(`INSERT INTO conversations(id) VALUES(?)`).run(cid);
    for (const uid of [one.id, two.id])
      db.prepare(
        `INSERT INTO conversation_members(id,conversationId,userId) VALUES(?,?,?)`,
      ).run(randomUUID(), cid, uid);
    requireConversationAccess(cid, one.id);
    db.prepare(`INSERT INTO blocks(id,blockingId,blockedId) VALUES(?,?,?)`).run(
      randomUUID(),
      two.id,
      one.id,
    );
    expect(() => requireConversationAccess(cid, one.id)).toThrow();
  });
});
describe("stable feed", () => {
  it("keeps pages stable after engagement changes and binds cursors to a viewer", async () => {
    const owner = account(),
      viewer = account();
    for (let i = 0; i < 5; i++) post(owner.id);
    await createSession(viewer);
    const first = await (await feed(request("/api/feed?limit=2"))).json();
    expect(first.data.items).toHaveLength(2);
    db.prepare(`UPDATE posts SET likeCount=10000 WHERE id=?`).run(
      first.data.items[0].id,
    );
    const second = await (
      await feed(request(`/api/feed?limit=2&cursor=${first.data.nextCursor}`))
    ).json();
    expect(
      second.data.items.every(
        (p: { id: string }) =>
          !first.data.items.some((q: { id: string }) => p.id === q.id),
      ),
    ).toBe(true);
    await createSession(account());
    expect(
      (await feed(request(`/api/feed?cursor=${first.data.nextCursor}`))).status,
    ).toBe(400);
  });
});
describe("request hardening", () => {
  it("rejects forged cross-origin mutations", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/api/posts", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
      }),
    );
    expect(response.status).toBe(403);
  });
  it("accepts same-origin mutations and requires the API header otherwise", () => {
    expect(
      middleware(
        new NextRequest("http://localhost:3000/api/posts", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      ).status,
    ).toBe(200);
    expect(
      middleware(
        new NextRequest("http://localhost:3000/api/posts", { method: "POST" }),
      ).status,
    ).toBe(403);
    expect(middleware(request("/api/posts", {})).status).toBe(200);
  });
  it("rejects unsafe profile URL schemes and bcrypt truncation", () => {
    expect(
      updateProfileSchema.safeParse({ website: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse("😀".repeat(30)).success).toBe(false);
  });
});
