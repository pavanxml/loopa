/**
 * Seed data — makes the app look populated in development.
 * Run with: npm run db:seed
 *
 * Only seeds an empty development database; never clears existing accounts.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";

const PASSWORD = "loopa1234";

const USERS = [
  { username: "maya", displayName: "Maya Reddy", bio: "Product designer. Collecting good typography and bad puns.", location: "Hyderabad, IN", skills: "design,figma,typography" },
  { username: "arjun", displayName: "Arjun Nair", bio: "Backend engineer. Distributed systems, filter coffee, long runs.", location: "Bengaluru, IN", skills: "go,postgres,kubernetes" },
  { username: "sofia", displayName: "Sofia Lindqvist", bio: "Climbing, film photography, and occasional Rust.", location: "Stockholm, SE", skills: "rust,photography" },
  { username: "kenji", displayName: "Kenji Watanabe", bio: "Building small tools that do one thing well.", location: "Osaka, JP", skills: "typescript,react" },
  { username: "amara", displayName: "Amara Okafor", bio: "Community organizer. Events, people, momentum.", location: "Lagos, NG", skills: "community,events,ops" },
  { username: "leo", displayName: "Leo Martins", bio: "Music producer. Sampling everything.", location: "São Paulo, BR", skills: "music,ableton" },
];

const POSTS = [
  { author: "maya", body: "Spent the weekend redrawing our icon set at 16px. Turns out half our metaphors only worked at 48px. #design #craft", likes: 34, comments: 6 },
  { author: "arjun", body: "Reminder that the fastest query is the one you never make. Added a read-through cache today and p99 dropped 400ms. #backend #performance", likes: 58, comments: 11 },
  { author: "sofia", body: "Shot a roll of Portra on the north face last weekend. The light at 6am is genuinely worth the 4am alarm. #photography #climbing", likes: 91, comments: 14 },
  { author: "kenji", body: "New tiny tool: paste a URL, get a readable outline. 200 lines, no dependencies, no account. That's the whole pitch. #buildinpublic", likes: 47, comments: 9 },
  { author: "amara", body: "We hit 400 people at the Lagos meetup. Biggest lesson: start the talks 20 minutes late on purpose. Everyone arrives late anyway. #community #events", likes: 76, comments: 18 },
  { author: "leo", body: "Made a whole beat out of my kitchen. Kettle for the hi-hat, fridge hum for the sub. #music #sampling", likes: 63, comments: 12 },
  { author: "maya", body: "Unpopular opinion: most dashboards would be better as a single well-written sentence. #design #product", likes: 112, comments: 27 },
  { author: "arjun", body: "Debugging a race condition that only reproduces on Tuesdays. I wish I were joking. #backend", likes: 88, comments: 21 },
  { author: "sofia", body: "Rewrote our image pipeline in Rust. 12x faster, and I finally understand lifetimes. Mostly. #rust", likes: 54, comments: 8 },
  { author: "kenji", body: "Shipping beats polishing, but only if you actually ship. Three unfinished projects staring at me right now. #buildinpublic", likes: 39, comments: 5 },
  { author: "amara", body: "Looking for speakers for next month's community night — topic is anything you've built and regretted. #community", likes: 41, comments: 16 },
  { author: "leo", body: "Anyone else find the best ideas show up exactly when you close the laptop? #music #creativity", likes: 67, comments: 10 },
];

const COMMENT_BODIES = [
  "This is such a good point.",
  "Saving this for later, thanks for sharing.",
  "Completely agree — learned this the hard way.",
  "Do you have a write-up somewhere? Would love more detail.",
  "Okay this made me laugh out loud.",
  "Following for more of this.",
];

async function main() {
  if(process.env.NODE_ENV==="production")throw new Error("Demo seeding is disabled in production.");
  if((db.prepare(`SELECT COUNT(*) count FROM users`).get() as {count:number}).count>0){console.log("Database already contains users. Demo seed skipped; existing data preserved.");return;}
  console.log("Seeding LOOPA…");

  // Clean slate for seeded data
  db.exec(`DELETE FROM posts_fts;`);
  for (const table of [
    "connections", "notification_preferences",
    "message_reactions", "messages", "conversation_members", "conversations", "presence",
    "moment_reactions", "moment_replies", "moments",
    "event_attendees", "events", "community_members", "communities",
    "collection_items", "collections", "hashtag_follows", "blocks", "mutes", "connections",
    "notifications", "post_hashtags", "hashtags", "saves", "likes",
    "comments", "post_media", "posts", "follows", "user_interests",
    "refresh_tokens", "email_verification_tokens", "password_reset_tokens",
    "reports", "audit_logs", "profiles", "users",
  ]) {
    db.exec(`DELETE FROM ${table};`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const userIds = new Map<string, string>();

  for (const u of USERS) {
    const id = randomUUID();
    userIds.set(u.username, id);
    db.prepare(
      `INSERT INTO users (id, email, username, passwordHash, emailVerifiedAt) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(id, `${u.username}@loopa.test`, u.username, passwordHash);
    db.prepare(
      `INSERT INTO profiles (id, userId, displayName, bio, location, skills) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), id, u.displayName, u.bio, u.location, u.skills);
  }

  // maya has opted into location sharing (demonstrates real Haversine-based
  // "Nearby" — everyone else deliberately has no coordinates, which is the
  // honest default until a user clicks "Use my location" themselves).
  db.prepare(`UPDATE profiles SET latitude = ?, longitude = ? WHERE userId = ?`)
    .run(17.385, 78.4867, userIds.get("maya")!);

  // An admin account for the dashboard
  const adminId = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, username, passwordHash, role, emailVerifiedAt) VALUES (?, ?, ?, ?, 'admin', datetime('now'))`
  ).run(adminId, "admin@loopa.test", "loopa_admin", passwordHash);
  db.prepare(`INSERT INTO profiles (id, userId, displayName, bio) VALUES (?, ?, ?, ?)`).run(
    randomUUID(), adminId, "LOOPA Admin", "Platform operations."
  );

  // Dense-ish follow graph so the ranked feed has affinity signal to work with
  const names = USERS.map((u) => u.username);
  for (const follower of names) {
    for (const following of names) {
      if (follower === following) continue;
      if (Math.random() > 0.45) continue;
      db.prepare(`INSERT OR IGNORE INTO follows (id, followerId, followingId) VALUES (?, ?, ?)`).run(
        randomUUID(), userIds.get(follower)!, userIds.get(following)!
      );
    }
  }

  // Interests drive the interestOverlapScore in src/lib/ranking.ts
  const INTERESTS: Record<string, string[]> = {
    maya: ["design", "product", "craft"],
    arjun: ["backend", "performance", "rust"],
    sofia: ["photography", "climbing", "rust"],
    kenji: ["buildinpublic", "design"],
    amara: ["community", "events"],
    leo: ["music", "creativity", "sampling"],
  };
  for (const [username, topics] of Object.entries(INTERESTS)) {
    for (const topic of topics) {
      db.prepare(`INSERT OR IGNORE INTO user_interests (id, userId, topic, weight) VALUES (?, ?, ?, ?)`).run(
        randomUUID(), userIds.get(username)!, topic, 1.0
      );
    }
  }

  const HASHTAG_RE = /#([a-zA-Z0-9_]+)/g;
  let hoursAgo = 2;

  for (const p of POSTS) {
    const postId = randomUUID();
    const authorId = userIds.get(p.author)!;
    db.prepare(
      `INSERT INTO posts (id, authorId, type, body, likeCount, commentCount, shareCount, createdAt)
       VALUES (?, ?, 'text', ?, ?, ?, ?, datetime('now', ?))`
    ).run(postId, authorId, p.body, p.likes, p.comments, Math.floor(p.likes / 8), `-${hoursAgo} hours`);
    db.prepare(`INSERT INTO posts_fts (postId, body) VALUES (?, ?)`).run(postId, p.body);
    hoursAgo += Math.floor(Math.random() * 7) + 2;

    for (const match of p.body.matchAll(HASHTAG_RE)) {
      const tag = match[1]!.toLowerCase();
      let row = db.prepare(`SELECT id FROM hashtags WHERE tag = ?`).get(tag) as { id: string } | undefined;
      if (!row) {
        const id = randomUUID();
        db.prepare(`INSERT INTO hashtags (id, tag, useCount) VALUES (?, ?, 1)`).run(id, tag);
        row = { id };
      } else {
        db.prepare(`UPDATE hashtags SET useCount = useCount + 1 WHERE id = ?`).run(row.id);
      }
      db.prepare(`INSERT OR IGNORE INTO post_hashtags (postId, hashtagId) VALUES (?, ?)`).run(postId, row.id);
    }

    // Real like rows for a subset (counts above are the denormalized cache)
    for (const username of names) {
      if (username === p.author || Math.random() > 0.5) continue;
      db.prepare(`INSERT OR IGNORE INTO likes (id, userId, postId) VALUES (?, ?, ?)`).run(
        randomUUID(), userIds.get(username)!, postId
      );
      db.prepare(
        `INSERT INTO notifications (id, recipientId, actorId, type, entityType, entityId) VALUES (?, ?, ?, 'like', 'post', ?)`
      ).run(randomUUID(), authorId, userIds.get(username)!, postId);
    }

    const commenters = names.filter((n) => n !== p.author).sort(() => Math.random() - 0.5).slice(0, 3);
    for (const username of commenters) {
      const body = COMMENT_BODIES[Math.floor(Math.random() * COMMENT_BODIES.length)]!;
      db.prepare(`INSERT INTO comments (id, postId, authorId, body) VALUES (?, ?, ?, ?)`).run(
        randomUUID(), postId, userIds.get(username)!, body
      );
      db.prepare(
        `INSERT INTO notifications (id, recipientId, actorId, type, entityType, entityId) VALUES (?, ?, ?, 'comment', 'post', ?)`
      ).run(randomUUID(), authorId, userIds.get(username)!, postId);
    }
  }

  // ---------- Communities ----------
  const COMMUNITIES = [
    { slug: "design-systems", name: "Design Systems", owner: "maya", privacy: "public",
      description: "Tokens, components, and the arguments about naming them.",
      rules: "1. Critique the work, not the person.\n2. Show your process.\n3. No recruiting posts." },
    { slug: "backend-guild", name: "Backend Guild", owner: "arjun", privacy: "public",
      description: "Databases, queues, and the joy of a p99 that finally behaves.",
      rules: "1. Benchmarks or it didn't happen.\n2. Be kind to beginners." },
    { slug: "film-photography", name: "Film Photography", owner: "sofia", privacy: "public",
      description: "Grain, light leaks, and the cost of developing." },
    { slug: "build-in-public", name: "Build in Public", owner: "kenji", privacy: "public",
      description: "Ship it, then tell everyone what broke." },
    { slug: "lagos-makers", name: "Lagos Makers", owner: "amara", privacy: "private",
      description: "A private space for organizers and makers around Lagos." },
  ];

  const communityIds = new Map<string, string>();
  for (const c of COMMUNITIES) {
    const id = randomUUID();
    communityIds.set(c.slug, id);
    db.prepare(
      `INSERT INTO communities (id, slug, name, description, privacy, rules, ownerId, memberCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, c.slug, c.name, c.description, c.privacy, c.rules ?? null, userIds.get(c.owner)!);
    db.prepare(`INSERT INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, 'owner')`)
      .run(randomUUID(), id, userIds.get(c.owner)!);

    // Populate each community with members, and promote a couple to moderator.
    let memberNo = 0;
    for (const username of names) {
      if (username === c.owner) continue;
      if (c.privacy === "private" && Math.random() > 0.5) continue;
      if (Math.random() > 0.7) continue;
      memberNo += 1;
      db.prepare(`INSERT OR IGNORE INTO community_members (id, communityId, userId, role) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), id, userIds.get(username)!, memberNo === 1 ? "moderator" : "member");
      db.prepare(`UPDATE communities SET memberCount = memberCount + 1 WHERE id = ?`).run(id);
    }
  }

  // A few community posts so the spaces aren't empty.
  const COMMUNITY_POSTS = [
    { slug: "design-systems", author: "maya", body: "We finally killed our 14 shades of grey. Down to 5 and nobody has complained. #design" },
    { slug: "design-systems", author: "kenji", body: "Question: do you version your tokens separately from your components? #design" },
    { slug: "backend-guild", author: "arjun", body: "Connection pooling saved us more than any query rewrite this quarter. #backend" },
    { slug: "backend-guild", author: "sofia", body: "Anyone running Rust services in prod? Curious about your deploy story. #rust" },
    { slug: "film-photography", author: "sofia", body: "Developing at home is cheaper than I expected. Setup cost paid for itself in 8 rolls. #photography" },
    { slug: "build-in-public", author: "kenji", body: "Week 3: 40 users, 2 paying. Churn is the whole game. #buildinpublic" },
  ];
  for (const cp of COMMUNITY_POSTS) {
    const cpId = randomUUID();
    db.prepare(
      `INSERT INTO posts (id, authorId, communityId, type, body, likeCount, commentCount, createdAt)
       VALUES (?, ?, ?, 'text', ?, ?, ?, datetime('now', ?))`
    ).run(cpId, userIds.get(cp.author)!, communityIds.get(cp.slug)!, cp.body,
          Math.floor(Math.random() * 40), Math.floor(Math.random() * 12),
          `-${Math.floor(Math.random() * 60) + 1} hours`);
    db.prepare(`INSERT INTO posts_fts (postId, body) VALUES (?, ?)`).run(cpId, cp.body);
  }

  // ---------- Events ----------
  const EVENTS = [
    { title: "Design Systems Night", lat: 17.4065, lng: 78.4772, host: "maya", community: "design-systems", mode: "offline",
      location: "Hyderabad, IN", category: "design", days: 6, capacity: 60,
      description: "Three short talks on tokens, theming, and documentation, then pizza." },
    { title: "Postgres Performance Workshop", host: "arjun", community: "backend-guild", mode: "online",
      category: "backend", days: 10, capacity: 200,
      description: "Hands-on session: query plans, indexes, and when to stop optimizing." },
    { title: "Golden Hour Photo Walk", lat: 59.3293, lng: 18.0686, host: "sofia", community: "film-photography", mode: "offline",
      location: "Stockholm, SE", category: "photography", days: 3, capacity: 20,
      description: "Bring a camera, any format. We start at the harbour." },
    { title: "Lagos Community Night", lat: 6.5244, lng: 3.3792, host: "amara", community: null, mode: "offline",
      location: "Lagos, NG", category: "community", days: 14, capacity: 400,
      description: "Lightning talks on things people built and regretted." },
    { title: "Ship It Friday", host: "kenji", community: "build-in-public", mode: "online",
      category: "buildinpublic", days: 2, capacity: null,
      description: "Demo whatever you have. Broken is fine." },
    { title: "Kitchen Sampling Session", host: "leo", community: null, mode: "online",
      category: "music", days: 8, capacity: 50,
      description: "Turning household noise into drum kits, live." },
  ];
  for (const e of EVENTS) {
    const id = randomUUID();
    const start = new Date(Date.now() + e.days * 86400000);
    db.prepare(
      `INSERT INTO events (id, hostId, communityId, title, description, category, mode, location, onlineUrl, startAt, endAt, capacity, attendeeCount, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, userIds.get(e.host)!, e.community ? communityIds.get(e.community)! : null,
          e.title, e.description, e.category, e.mode,
          e.mode === "offline" ? e.location ?? null : null,
          e.mode === "online" ? "https://meet.loopa.test/" + id.slice(0, 8) : null,
          start.toISOString(), new Date(start.getTime() + 7200000).toISOString(), e.capacity,
          (e as { lat?: number }).lat ?? null, (e as { lng?: number }).lng ?? null);
    db.prepare(`INSERT INTO event_attendees (id, eventId, userId, status) VALUES (?, ?, ?, 'going')`)
      .run(randomUUID(), id, userIds.get(e.host)!);

    for (const username of names) {
      if (username === e.host || Math.random() > 0.55) continue;
      db.prepare(`INSERT OR IGNORE INTO event_attendees (id, eventId, userId, status) VALUES (?, ?, ?, 'going')`)
        .run(randomUUID(), id, userIds.get(username)!);
      db.prepare(`UPDATE events SET attendeeCount = attendeeCount + 1 WHERE id = ?`).run(id);
    }
  }

  // ---------- Moments (expire in 24h) ----------
  const MOMENTS = [
    { author: "sofia", text: "6am. Fog on the water. Worth it." },
    { author: "leo", text: "Found a broken cassette player at a flea market. It's perfect." },
    { author: "maya", text: "Third coffee. The icons are winning." },
    { author: "amara", text: "Venue confirmed for next month 🎉" },
  ];
  for (const m of MOMENTS) {
    const hoursAgoMoment = Math.floor(Math.random() * 12) + 1;
    db.prepare(
      `INSERT INTO moments (id, authorId, kind, text, createdAt, expiresAt)
       VALUES (?, ?, 'text', ?, datetime('now', ?), datetime('now', ?))`
    ).run(randomUUID(), userIds.get(m.author)!, m.text,
          `-${hoursAgoMoment} hours`, `+${24 - hoursAgoMoment} hours`);
  }

  // ---------- Conversations ----------
  const CHATS: { a: string; b: string; messages: { from: string; body: string }[] }[] = [
    { a: "maya", b: "arjun", messages: [
      { from: "maya", body: "Do you have 20 minutes this week to look at the settings page?" },
      { from: "arjun", body: "Thursday afternoon works. Send the link and I'll look before then." },
      { from: "maya", body: "Perfect, sending now." },
    ]},
    { a: "sofia", b: "leo", messages: [
      { from: "leo", body: "That harbour shot — was that pushed two stops?" },
      { from: "sofia", body: "One stop. The fog did most of the work honestly." },
    ]},
    { a: "amara", b: "kenji", messages: [
      { from: "amara", body: "Would you speak at community night? 10 minutes, anything you've built." },
      { from: "kenji", body: "I'd love to. Can I talk about the three projects I abandoned?" },
      { from: "amara", body: "That's exactly the talk I want." },
    ]},
  ];
  for (const chat of CHATS) {
    const convId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, isGroup) VALUES (?, 0)`).run(convId);
    for (const u of [chat.a, chat.b]) {
      db.prepare(`INSERT INTO conversation_members (id, conversationId, userId) VALUES (?, ?, ?)`)
        .run(randomUUID(), convId, userIds.get(u)!);
    }
    let offset = chat.messages.length + 1;
    for (const m of chat.messages) {
      db.prepare(
        `INSERT INTO messages (id, conversationId, senderId, kind, body, createdAt)
         VALUES (?, ?, ?, 'text', ?, datetime('now', ?))`
      ).run(randomUUID(), convId, userIds.get(m.from)!, m.body, `-${offset * 20} minutes`);
      offset -= 1;
    }
  }

  // ---------- Collections ----------
  for (const username of ["maya", "arjun"]) {
    for (const name of ["Travel", "Ideas", "Learning"]) {
      db.prepare(`INSERT OR IGNORE INTO collections (id, userId, name) VALUES (?, ?, ?)`)
        .run(randomUUID(), userIds.get(username)!, name);
    }
  }

  // ---------- A pending report so the admin queue isn't empty ----------
  const somePost = db.prepare(`SELECT id, authorId FROM posts LIMIT 1`).get() as { id: string; authorId: string };
  db.prepare(
    `INSERT INTO reports (id, reporterId, reportedUserId, postId, reason, details)
     VALUES (?, ?, ?, ?, 'spam', 'Looks like promotional content.')`
  ).run(randomUUID(), userIds.get("leo")!, somePost.authorId, somePost.id);

  // Demo counters reflect the actual fixture rows rather than invented engagement.
  db.exec(`UPDATE posts SET likeCount=(SELECT COUNT(*) FROM likes WHERE postId=posts.id),
    commentCount=(SELECT COUNT(*) FROM comments WHERE postId=posts.id AND deletedAt IS NULL),
    saveCount=(SELECT COUNT(*) FROM saves WHERE postId=posts.id),shareCount=0`);
  const counts = {
    users: (db.prepare(`SELECT COUNT(*) c FROM users`).get() as { c: number }).c,
    posts: (db.prepare(`SELECT COUNT(*) c FROM posts`).get() as { c: number }).c,
    comments: (db.prepare(`SELECT COUNT(*) c FROM comments`).get() as { c: number }).c,
    likes: (db.prepare(`SELECT COUNT(*) c FROM likes`).get() as { c: number }).c,
    follows: (db.prepare(`SELECT COUNT(*) c FROM follows`).get() as { c: number }).c,
    notifications: (db.prepare(`SELECT COUNT(*) c FROM notifications`).get() as { c: number }).c,
    communities: (db.prepare(`SELECT COUNT(*) c FROM communities`).get() as { c: number }).c,
    events: (db.prepare(`SELECT COUNT(*) c FROM events`).get() as { c: number }).c,
    moments: (db.prepare(`SELECT COUNT(*) c FROM moments`).get() as { c: number }).c,
    messages: (db.prepare(`SELECT COUNT(*) c FROM messages`).get() as { c: number }).c,
    reports: (db.prepare(`SELECT COUNT(*) c FROM reports`).get() as { c: number }).c,
  };
  console.log("Seeded:", counts);
  console.log(`\nLog in with any of: ${names.join(", ")} (or loopa_admin)`);
  console.log(`Password for all seeded accounts: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
