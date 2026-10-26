import { z } from "zod";

export const safeUrl = z.string().max(2000).refine(v => /^https:\/\//.test(v) || /^\/api\/media\/(image|video)\/[a-f0-9-]+(?:_thumb)?\.[a-z0-9]+$/.test(v), "Use an HTTPS URL or an uploaded file");

// Reserved so no one can register a username that shadows a route or
// impersonates the platform itself.
const RESERVED_USERNAMES = new Set([
  "admin", "root", "loopa", "support", "help", "api", "moderator",
  "settings", "notifications", "messages", "discover", "communities",
  "events", "moments", "null", "undefined", "system",
]);

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be at most 24 characters")
  .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores")
  .refine((v) => !/^\d+$/.test(v), "Username can't be all numbers")
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is reserved");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .refine(v => new TextEncoder().encode(v).length <= 72, "Password must be at most 72 UTF-8 bytes");

export const signupSchema = z.object({
  email: z.string().email().max(254),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(50),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(280).optional(),
  location: z.string().max(80).optional(),
  website: z.string().url().max(200).refine(v => /^https?:\/\//.test(v), "Use an HTTP or HTTPS website").optional().or(z.literal("")),
  avatarUrl: safeUrl.optional(),
  skills: z.string().max(200).optional(),
  privacy: z.enum(["public", "followers", "private"]).optional(),
  dmPolicy: z.enum(["everyone", "followers", "none"]).optional(),
  followPolicy: z.enum(["open", "approval_required"]).optional(),
  commentPolicy: z.enum(["everyone", "followers", "none"]).optional(),
  mentionPolicy: z.enum(["everyone", "followers", "none"]).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const HASHTAG_RE = /#([a-zA-Z0-9_]{1,50})/g;
const MAX_HASHTAGS_PER_POST = 10;

export const createPostSchema = z
  .object({
    type: z.enum(["text", "image", "video", "question", "poll"]),
    body: z.string().trim().max(3000).optional(),
    visibility: z.enum(["public", "followers", "friends", "private"]).default("public"),
    location: z.string().max(120).optional(),
    // Each item carries its own kind so a post can mix photos and clips
    // without every attachment being mislabeled as the post's overall type.
    // Accepts absolute URLs (S3/CDN in production) or local paths like
    // "/uploads/image/xyz.jpg" (this build's local-disk storage backend).
    mediaUrls: z.array(z.object({
      url: safeUrl,
      kind: z.enum(["image", "video"]).default("image"),
      // Populated by the thumbnail/probe pipeline in src/services/storage.ts
      // and passed straight through from the upload response.
      thumbnailUrl: safeUrl.optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      durationMs: z.number().int().positive().optional(),
    })).max(10).default([]),
    poll: z
      .object({
        question: z.string().min(1).max(280),
        options: z.array(z.string().min(1).max(80)).min(2).max(6),
        closesInHours: z.number().int().min(1).max(168).optional(),
      })
      .optional(),
  })
  .refine((v) => v.type !== "poll" || !!v.poll, "Poll posts require poll data")
  .refine((v) => v.type === "poll" || !!v.body || v.mediaUrls.length > 0, "Post needs a body or media")
  .refine((v) => {
    const tags = v.body?.match(HASHTAG_RE) ?? [];
    return tags.length <= MAX_HASHTAGS_PER_POST;
  }, `Use at most ${MAX_HASHTAGS_PER_POST} hashtags per post`);

export function extractHashtags(body: string | undefined | null): string[] {
  if (!body) return [];
  const found = body.match(HASHTAG_RE) ?? [];
  const unique = new Set(found.map((h) => h.slice(1).toLowerCase()));
  return Array.from(unique).slice(0, MAX_HASHTAGS_PER_POST);
}

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  parentId: z.string().optional(),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const reportSchema = z.object({
  reason: z.enum([
    "spam", "harassment", "hate_speech", "violence", "nudity",
    "misinformation", "self_harm", "other",
  ]),
  details: z.string().max(500).optional(),
  postId: z.string().optional(),
  commentId: z.string().optional(),
  reportedUserId: z.string().optional(),
});

// ===================== PHASE 3–8 SCHEMAS =====================

export const slugSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only");

export const createCommunitySchema = z.object({
  name: z.string().min(2).max(60),
  slug: slugSchema,
  description: z.string().max(500).optional(),
  privacy: z.enum(["public", "private", "invite_only"]).default("public"),
  rules: z.string().max(2000).optional(),
});

export const updateCommunitySchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(500).optional(),
  privacy: z.enum(["public", "private", "invite_only"]).optional(),
  rules: z.string().max(2000).optional(),
  iconUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
});

export const memberRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "moderator", "member"]),
});

export const createEventSchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().max(3000).optional(),
    category: z.string().max(40).optional(),
    mode: z.enum(["online", "offline"]),
    location: z.string().max(200).optional(),
    onlineUrl: z.string().url().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    capacity: z.number().int().min(1).max(100000).optional(),
    communityId: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine((v) => v.mode !== "offline" || !!v.location, "In-person events need a location")
  .refine((v) => v.mode !== "online" || !!v.onlineUrl, "Online events need a join link")
  .refine((v) => !v.endAt || new Date(v.endAt) > new Date(v.startAt), "End time must be after start time")
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), "Provide both latitude and longitude, or neither");

export const createMomentSchema = z
  .object({
    kind: z.enum(["photo", "video", "text"]),
    mediaUrl: safeUrl.optional(),
    text: z.string().max(280).optional(),
  })
  .refine((v) => v.kind === "text" || !!v.mediaUrl, "Photo and video moments need media")
  .refine((v) => v.kind !== "text" || !!v.text?.trim(), "Text moments need text");

export const createMessageSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  kind: z.enum(["text", "image", "video", "file"]).default("text"),
  mediaUrl: safeUrl.optional(),
  replyToId: z.string().optional(),
}).refine((v) => !!v.body || !!v.mediaUrl, "A message needs text or media");

export const createConversationSchema = z.object({
  participantUsernames: z.array(z.string()).min(1).max(50),
  title: z.string().max(80).optional(),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(["all", "users", "posts", "hashtags", "communities", "events"]).default("all"),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(40),
});

export const resolveReportSchema = z.object({
  action: z.enum(["dismiss", "remove_content", "suspend_user"]),
  note: z.string().max(500).optional(),
});

export const connectionRequestSchema = z.object({ username: z.string().min(1) });
export const connectionRespondSchema = z.object({ action: z.enum(["accept", "decline"]) });
