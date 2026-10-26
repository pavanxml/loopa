-- =====================================================================
-- LOOPA — PostgreSQL DDL, translated directly from prisma/schema.prisma.
--
-- Why this file exists: `prisma migrate` / `prisma generate` / even
-- `prisma validate` all unconditionally fetch a query/schema engine
-- binary from binaries.prisma.sh before doing anything — confirmed by
-- running each of them here and watching them fail identically, even
-- `prisma --help`. That domain isn't reachable from this sandbox's
-- network policy. Rather than leave the "Postgres migration" limitation
-- as pure documentation, this file is a faithful, by-hand translation of
-- every model in schema.prisma, applied to a real, running PostgreSQL 16
-- instance in this session and confirmed to create successfully with
-- every primary key, foreign key, unique constraint, and index intact.
--
-- Table and column names match schema.prisma's model/field names exactly
-- (Prisma's default mapping with no @@map), so this is not a divergent
-- schema — it is schema.prisma, in SQL. On a machine with normal network
-- access, `prisma migrate dev` will generate the equivalent (and take
-- over as the source of truth for future migrations) — this file's job
-- is done once that's possible.
-- =====================================================================

-- ============================= IDENTITY =================================

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerifiedAt" TIMESTAMP(3),
  "username" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "User_username_idx" ON "User"("username");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE TABLE "Profile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "coverUrl" TEXT,
  "bio" TEXT,
  "location" TEXT,
  "website" TEXT,
  "skills" TEXT,
  "privacy" TEXT NOT NULL DEFAULT 'public',
  "dmPolicy" TEXT NOT NULL DEFAULT 'everyone',
  "followPolicy" TEXT NOT NULL DEFAULT 'open',
  "commentPolicy" TEXT NOT NULL DEFAULT 'everyone',
  "mentionPolicy" TEXT NOT NULL DEFAULT 'everyone',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedBy" TEXT
);
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3)
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3)
);

-- ============================ SOCIAL GRAPH ===============================

CREATE TABLE "Follow" (
  "id" TEXT PRIMARY KEY,
  "followerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "followingId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("followerId", "followingId")
);
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

CREATE TABLE "Connection" (
  "id" TEXT PRIMARY KEY,
  "requesterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "addresseeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  UNIQUE ("requesterId", "addresseeId")
);
CREATE INDEX "Connection_addresseeId_idx" ON "Connection"("addresseeId");

CREATE TABLE "Block" (
  "id" TEXT PRIMARY KEY,
  "blockingId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "blockedId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("blockingId", "blockedId")
);

CREATE TABLE "Mute" (
  "id" TEXT PRIMARY KEY,
  "mutingId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "mutedId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("mutingId", "mutedId")
);

CREATE TABLE "UserInterest" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "topic" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  UNIQUE ("userId", "topic")
);
CREATE INDEX "UserInterest_topic_idx" ON "UserInterest"("topic");

-- ============================ COMMUNITIES =================================
-- (created before Post/Event, which both hold an optional FK to it)

CREATE TABLE "Community" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "iconUrl" TEXT,
  "coverUrl" TEXT,
  "privacy" TEXT NOT NULL DEFAULT 'public',
  "rules" TEXT,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id"),
  "memberCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "Community_privacy_idx" ON "Community"("privacy");

CREATE TABLE "CommunityMember" (
  "id" TEXT PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'active',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("communityId", "userId")
);
CREATE INDEX "CommunityMember_userId_idx" ON "CommunityMember"("userId");

-- ============================== CONTENT ==================================

CREATE TABLE "Post" (
  "id" TEXT PRIMARY KEY,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "communityId" TEXT REFERENCES "Community"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "body" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "commentPolicy" TEXT NOT NULL DEFAULT 'everyone',
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "shareCount" INTEGER NOT NULL DEFAULT 0,
  "saveCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");
CREATE INDEX "Post_communityId_createdAt_idx" ON "Post"("communityId", "createdAt");
CREATE INDEX "Post_status_createdAt_idx" ON "Post"("status", "createdAt");

CREATE TABLE "PostMedia" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "durationMs" INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

CREATE TABLE "Poll" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL UNIQUE REFERENCES "Post"("id") ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "closesAt" TIMESTAMP(3)
);

CREATE TABLE "PollOption" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "Poll"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL
);

CREATE TABLE "PollVote" (
  "id" TEXT PRIMARY KEY,
  "optionId" TEXT NOT NULL REFERENCES "PollOption"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("optionId", "userId")
);

CREATE TABLE "Comment" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "parentId" TEXT REFERENCES "Comment"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'published',
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

CREATE TABLE "Like" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "postId" TEXT REFERENCES "Post"("id") ON DELETE CASCADE,
  "commentId" TEXT REFERENCES "Comment"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "postId"),
  UNIQUE ("userId", "commentId")
);
CREATE INDEX "Like_postId_idx" ON "Like"("postId");
CREATE INDEX "Like_commentId_idx" ON "Like"("commentId");

CREATE TABLE "Collection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");

CREATE TABLE "Save" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "postId" TEXT NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "collectionId" TEXT REFERENCES "Collection"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "postId")
);

CREATE TABLE "CollectionItem" (
  "id" TEXT PRIMARY KEY,
  "collectionId" TEXT NOT NULL REFERENCES "Collection"("id") ON DELETE CASCADE,
  "itemType" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("collectionId", "itemType", "itemId")
);

CREATE TABLE "Hashtag" (
  "id" TEXT PRIMARY KEY,
  "tag" TEXT NOT NULL UNIQUE,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Hashtag_useCount_idx" ON "Hashtag"("useCount");

CREATE TABLE "PostHashtag" (
  "postId" TEXT NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "hashtagId" TEXT NOT NULL REFERENCES "Hashtag"("id") ON DELETE CASCADE,
  PRIMARY KEY ("postId", "hashtagId")
);
CREATE INDEX "PostHashtag_hashtagId_idx" ON "PostHashtag"("hashtagId");

CREATE TABLE "HashtagFollow" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "hashtagId" TEXT NOT NULL REFERENCES "Hashtag"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "hashtagId")
);

-- ============================= MOMENTS ====================================

CREATE TABLE "Moment" (
  "id" TEXT PRIMARY KEY,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "text" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Moment_authorId_expiresAt_idx" ON "Moment"("authorId", "expiresAt");
CREATE INDEX "Moment_expiresAt_idx" ON "Moment"("expiresAt");

CREATE TABLE "MomentReaction" (
  "id" TEXT PRIMARY KEY,
  "momentId" TEXT NOT NULL REFERENCES "Moment"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("momentId", "userId", "emoji")
);

CREATE TABLE "MomentReply" (
  "id" TEXT PRIMARY KEY,
  "momentId" TEXT NOT NULL REFERENCES "Moment"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================== EVENTS =====================================

CREATE TABLE "Event" (
  "id" TEXT PRIMARY KEY,
  "hostId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "communityId" TEXT REFERENCES "Community"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "category" TEXT,
  "mode" TEXT NOT NULL,
  "location" TEXT,
  "onlineUrl" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "capacity" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");
CREATE INDEX "Event_communityId_idx" ON "Event"("communityId");

CREATE TABLE "EventAttendee" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'going',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventId", "userId")
);
CREATE INDEX "EventAttendee_userId_idx" ON "EventAttendee"("userId");

-- ============================= MESSAGING ====================================

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "isGroup" BOOLEAN NOT NULL DEFAULT FALSE,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ConversationMember" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "lastReadAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("conversationId", "userId")
);
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT,
  "mediaUrl" TEXT,
  "replyToId" TEXT REFERENCES "Message"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

CREATE TABLE "MessageReaction" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("messageId", "userId", "emoji")
);

-- ============================ NOTIFICATIONS ===================================

CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");

CREATE TABLE "NotificationPreference" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "likes" BOOLEAN NOT NULL DEFAULT TRUE,
  "comments" BOOLEAN NOT NULL DEFAULT TRUE,
  "follows" BOOLEAN NOT NULL DEFAULT TRUE,
  "connectionRequest" BOOLEAN NOT NULL DEFAULT TRUE,
  "messages" BOOLEAN NOT NULL DEFAULT TRUE,
  "mentions" BOOLEAN NOT NULL DEFAULT TRUE,
  "communityActivity" BOOLEAN NOT NULL DEFAULT TRUE,
  "eventReminder" BOOLEAN NOT NULL DEFAULT TRUE,
  "invitation" BOOLEAN NOT NULL DEFAULT TRUE,
  "moderationAction" BOOLEAN NOT NULL DEFAULT TRUE,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================ MODERATION & SAFETY ==============================

CREATE TABLE "Report" (
  "id" TEXT PRIMARY KEY,
  "reporterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "reportedUserId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "postId" TEXT REFERENCES "Post"("id") ON DELETE CASCADE,
  "commentId" TEXT REFERENCES "Comment"("id") ON DELETE CASCADE,
  "communityId" TEXT REFERENCES "Community"("id") ON DELETE CASCADE,
  "eventId" TEXT REFERENCES "Event"("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- ============================ OAUTH ===============================

CREATE TABLE "OAuthAccount" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("provider", "providerAccountId")
);
