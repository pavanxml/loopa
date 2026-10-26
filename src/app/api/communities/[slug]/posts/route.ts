import { NextRequest } from "next/server";
import { db, indexPostForSearch } from "@/lib/db";
import { newId } from "@/lib/id";
import { createPostSchema, extractHashtags } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { requireRole } from "@/lib/permissions";
import { aiService } from "@/services/ai";

/** Create a post inside a community. Membership is required and checked server-side. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireUser();
    const { slug } = await params;

    const community = db
      .prepare(`SELECT id FROM communities WHERE slug = ? AND deletedAt IS NULL`)
      .get(slug) as { id: string } | undefined;
    if (!community) throw new ApiError("not_found", "Community not found.", 404);

    requireRole(community.id, session.sub, "member");

    const body = createPostSchema.parse(await request.json());
    if (body.body) {
      const moderation = await aiService.moderateText(body.body);
      if (moderation.flagged) {
        throw new ApiError("content_flagged", "This post looks like spam. Please revise it.", 422);
      }
    }

    const postId = newId();
    db.prepare(
      `INSERT INTO posts (id, authorId, communityId, type, body, visibility) VALUES (?, ?, ?, ?, ?, 'public')`
    ).run(postId, session.sub, community.id, body.type, body.body ?? null);

    if (body.body) indexPostForSearch(postId, body.body);

    for (const tag of extractHashtags(body.body)) {
      let hashtag = db.prepare(`SELECT id FROM hashtags WHERE tag = ?`).get(tag) as { id: string } | undefined;
      if (!hashtag) {
        const id = newId();
        db.prepare(`INSERT INTO hashtags (id, tag, useCount) VALUES (?, ?, 1)`).run(id, tag);
        hashtag = { id };
      } else {
        db.prepare(`UPDATE hashtags SET useCount = useCount + 1 WHERE id = ?`).run(hashtag.id);
      }
      db.prepare(`INSERT OR IGNORE INTO post_hashtags (postId, hashtagId) VALUES (?, ?)`).run(postId, hashtag.id);
    }

    return ok({ id: postId }, 201);
  } catch (err) {
    return handleError(err);
  }
}
