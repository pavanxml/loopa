import { NextRequest } from "next/server";
import { db, indexPostForSearch, transaction } from "@/lib/db";
import { assertOwnedMedia } from "@/lib/postAccess";
import { newId } from "@/lib/id";
import { createPostSchema, extractHashtags } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { aiService } from "@/services/ai";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();

    const rl = await checkRateLimit(clientKey(request, `post:${session.sub}`), 15, 60_000);
    if (!rl.allowed) return fail("rate_limited", "You're posting too quickly. Take a breath.", 429);

    const body = createPostSchema.parse(await request.json());

    if (body.body) {
      const moderation = await aiService.moderateText(body.body);
      if (moderation.flagged) {
        return fail(
          "content_flagged",
          "This post looks like it may violate our spam policy. Please revise it.",
          422
        );
      }
    }

    const postId = newId();
    for (const media of body.mediaUrls) { assertOwnedMedia(session.sub, media.url); if(media.thumbnailUrl) assertOwnedMedia(session.sub, media.thumbnailUrl); }
    transaction(() => {
    db.prepare(
      `INSERT INTO posts (id, authorId, type, body, visibility, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(postId, session.sub, body.type, body.body ?? null, body.visibility, body.location ?? null);

    body.mediaUrls.forEach((m, i) => {
      db.prepare(
        `INSERT INTO post_media (id, postId, kind, storageKey, url, thumbnailUrl, width, height, durationMs, "order")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(newId(), postId, m.kind, m.url, m.url, m.thumbnailUrl ?? null,
            m.width ?? null, m.height ?? null, m.durationMs ?? null, i);
    });

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

    if (body.poll) db.prepare(`UPDATE posts SET pollJson=? WHERE id=?`).run(JSON.stringify(body.poll),postId);
    });
    return ok({ id: postId }, 201);
  } catch (err) {
    return handleError(err);
  }
}
