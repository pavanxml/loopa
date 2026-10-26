/**
 * Runtime SQLite schema for the original single-host application.
 * Additive changes preserve existing data. Prisma/PostgreSQL files are
 * retained as legacy references and are not used by this runtime.
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

// `node:sqlite` is a Node builtin, but it postdates several bundlers'
// builtin lists — a static `import ... from "node:sqlite"` gets rewritten
// to a bare "sqlite" specifier and fails to resolve under Vite/Vitest.
// Requiring it at runtime keeps it invisible to the transform pipeline.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

const DATA_DIR = path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.SQLITE_PATH ?? path.join(DATA_DIR, "loopa.db");

declare global {
  // eslint-disable-next-line no-var
  var __loopaDb: DatabaseSync | undefined;
}

export const db: DatabaseSync = global.__loopaDb ?? new DatabaseSync(DB_PATH);
global.__loopaDb = db;

db.exec("PRAGMA busy_timeout = 10000;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ---------------------------------------------------------------------
// Runtime schema. Keep additions backwards compatible with existing files.
// ---------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  emailVerifiedAt TEXT,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  displayName TEXT NOT NULL,
  avatarUrl TEXT,
  coverUrl TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  skills TEXT,
  privacy TEXT NOT NULL DEFAULT 'public',
  dmPolicy TEXT NOT NULL DEFAULT 'everyone',
  followPolicy TEXT NOT NULL DEFAULT 'open',
  commentPolicy TEXT NOT NULL DEFAULT 'everyone',
  mentionPolicy TEXT NOT NULL DEFAULT 'everyone',
  latitude REAL,
  longitude REAL,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL,
  revokedAt TEXT
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  followerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followingId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(followerId, followingId)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(followingId);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(followerId);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  authorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  communityId TEXT,
  type TEXT NOT NULL,
  body TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  location TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  pinned INTEGER NOT NULL DEFAULT 0,
  commentPolicy TEXT NOT NULL DEFAULT 'everyone',
  likeCount INTEGER NOT NULL DEFAULT 0,
  commentCount INTEGER NOT NULL DEFAULT 0,
  shareCount INTEGER NOT NULL DEFAULT 0,
  saveCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(authorId, createdAt);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, createdAt);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storageKey TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnailUrl TEXT,
  width INTEGER,
  height INTEGER,
  durationMs INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(postId);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  authorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parentId TEXT REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  likeCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(postId, createdAt);

CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  postId TEXT REFERENCES posts(id) ON DELETE CASCADE,
  commentId TEXT REFERENCES comments(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, postId),
  UNIQUE(userId, commentId)
);

CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collectionId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, postId)
);

CREATE TABLE IF NOT EXISTS hashtags (
  id TEXT PRIMARY KEY,
  tag TEXT UNIQUE NOT NULL,
  useCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtagId TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (postId, hashtagId)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipientId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actorId TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  entityType TEXT,
  entityId TEXT,
  readAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipientId, createdAt);

CREATE TABLE IF NOT EXISTS user_interests (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  UNIQUE(userId, topic)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporterId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reportedUserId TEXT,
  postId TEXT,
  commentId TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actorId TEXT,
  action TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, createdAt);

-- ===================== COMMUNITIES =====================

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  iconUrl TEXT,
  coverUrl TEXT,
  privacy TEXT NOT NULL DEFAULT 'public',
  rules TEXT,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memberCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_communities_privacy ON communities(privacy);

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  communityId TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joinedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(communityId, userId)
);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(userId);

-- ===================== EVENTS =====================

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  hostId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  communityId TEXT REFERENCES communities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  coverUrl TEXT,
  category TEXT,
  mode TEXT NOT NULL DEFAULT 'offline',
  location TEXT,
  onlineUrl TEXT,
  latitude REAL,
  longitude REAL,
  startAt TEXT NOT NULL,
  endAt TEXT,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  attendeeCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(startAt);
CREATE INDEX IF NOT EXISTS idx_events_community ON events(communityId);

CREATE TABLE IF NOT EXISTS event_attendees (
  id TEXT PRIMARY KEY,
  eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(eventId, userId)
);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(userId);

-- ===================== MOMENTS =====================

CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  authorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mediaUrl TEXT,
  text TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moments_expires ON moments(expiresAt);
CREATE INDEX IF NOT EXISTS idx_moments_author ON moments(authorId, expiresAt);

CREATE TABLE IF NOT EXISTS moment_reactions (
  id TEXT PRIMARY KEY,
  momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(momentId, userId, emoji)
);

CREATE TABLE IF NOT EXISTS moment_replies (
  id TEXT PRIMARY KEY,
  momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== MESSAGING =====================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  isGroup INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lastReadAt TEXT,
  joinedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(conversationId, userId)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(userId);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  senderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  mediaUrl TEXT,
  replyToId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversationId, createdAt);

CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  messageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(messageId, userId, emoji)
);

-- Presence is ephemeral by nature. Stored here (rather than in memory) so it
-- survives restarts and works across instances; a production deployment
-- should move this to Redis with a TTL.
CREATE TABLE IF NOT EXISTS presence (
  userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lastSeenAt TEXT NOT NULL,
  typingInConversationId TEXT,
  typingUpdatedAt TEXT
);

-- ===================== SAVED / COLLECTIONS =====================

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, name)
);

CREATE TABLE IF NOT EXISTS collection_items (
  id TEXT PRIMARY KEY,
  collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  itemType TEXT NOT NULL,
  itemId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(collectionId, itemType, itemId)
);

-- ===================== SAFETY =====================

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blockingId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blockedId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(blockingId, blockedId)
);

CREATE TABLE IF NOT EXISTS mutes (
  id TEXT PRIMARY KEY,
  mutingId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutedId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mutingId, mutedId)
);

CREATE TABLE IF NOT EXISTS hashtag_follows (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hashtagId TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, hashtagId)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  likes INTEGER NOT NULL DEFAULT 1,
  comments INTEGER NOT NULL DEFAULT 1,
  follows INTEGER NOT NULL DEFAULT 1,
  connection_request INTEGER NOT NULL DEFAULT 1,
  messages INTEGER NOT NULL DEFAULT 1,
  mentions INTEGER NOT NULL DEFAULT 1,
  community_activity INTEGER NOT NULL DEFAULT 1,
  event_reminder INTEGER NOT NULL DEFAULT 1,
  invitation INTEGER NOT NULL DEFAULT 1,
  moderation_action INTEGER NOT NULL DEFAULT 1,
  pushEnabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, providerAccountId)
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  requesterId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addresseeId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  respondedAt TEXT,
  UNIQUE(requesterId, addresseeId)
);
`);

// Columns added after the initial schema shipped. SQLite has no
// "ADD COLUMN IF NOT EXISTS", so each is attempted and its duplicate-column
// error swallowed — the equivalent of a forward-only migration step.
for (const stmt of [
  `ALTER TABLE reports ADD COLUMN communityId TEXT`,
  `ALTER TABLE reports ADD COLUMN eventId TEXT`,
  `ALTER TABLE reports ADD COLUMN resolvedById TEXT`,
  `ALTER TABLE reports ADD COLUMN resolvedAt TEXT`,
  `ALTER TABLE posts ADD COLUMN communityId TEXT`,
  `ALTER TABLE profiles ADD COLUMN latitude REAL`,
  `ALTER TABLE profiles ADD COLUMN longitude REAL`,
  `ALTER TABLE events ADD COLUMN latitude REAL`,
  `ALTER TABLE events ADD COLUMN longitude REAL`,
]) {
  try { db.exec(stmt); } catch (error) {
    if(!(error instanceof Error)||!error.message.includes("duplicate column name"))throw error;
  }
}

// Full-text search index for post bodies (SQLite FTS5, a real inverted
// index with bm25 ranking — not a LIKE scan dressed up). Kept as a separate
// unlinked table (postId as a plain column) rather than an FTS5
// "external content" table, since those require INTEGER rowids and this
// schema uses UUID text ids throughout.
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(postId UNINDEXED, body);`);

export function indexPostForSearch(postId: string, body: string): void {
  db.prepare(`INSERT INTO posts_fts (postId, body) VALUES (?, ?)`).run(postId, body);
}

export type Row = Record<string, unknown>;

// Additive migrations preserve existing accounts and content.
for (const [table, column, definition] of [
  ["refresh_tokens", "familyId", "TEXT"], ["posts", "pollJson", "TEXT"],
] as const) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storageKey TEXT NOT NULL UNIQUE, url TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    mimeType TEXT NOT NULL, size INTEGER NOT NULL, createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS follow_requests (
    id TEXT PRIMARY KEY, requesterId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    targetId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, createdAt TEXT NOT NULL,
    UNIQUE(requesterId, targetId)
  );
  CREATE TABLE IF NOT EXISTS hidden_posts (
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(userId, postId)
  );
  CREATE TABLE IF NOT EXISTS feed_snapshots (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL, mode TEXT NOT NULL, postIds TEXT NOT NULL, expiresAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feed_snapshots_expiry ON feed_snapshots(expiresAt);
  CREATE INDEX IF NOT EXISTS idx_sessions_family ON refresh_tokens(userId, familyId);
  CREATE INDEX IF NOT EXISTS idx_upload_owner ON uploads(userId);
  CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(targetId);
  CREATE INDEX IF NOT EXISTS idx_post_visibility ON posts(status, visibility, createdAt);
  CREATE TABLE IF NOT EXISTS mail_outbox (
    id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt INTEGER NOT NULL, leaseUntil INTEGER, createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mail_pending ON mail_outbox(status,nextAttemptAt);
`);

/** Synchronous only: never hold SQLite's write lock across an await. */
export function transaction<T>(work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    if (result instanceof Promise) throw new Error("Transactions must be synchronous");
    db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
