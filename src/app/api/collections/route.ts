import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { createCollectionSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { z } from "zod";
import { filterVisiblePosts } from "@/lib/postAccess";

/** List the viewer's collections plus their uncategorized saved posts. */
export async function GET() {
  try {
    const session = await requireUser();

    const collections = db.prepare(
      `SELECT c.id, c.name, c.createdAt,
              (SELECT COUNT(*) FROM saves WHERE collectionId = c.id) +
              (SELECT COUNT(*) FROM collection_items WHERE collectionId = c.id) as itemCount
       FROM collections c WHERE c.userId = ? ORDER BY c.createdAt ASC`
    ).all(session.sub);

    const savedPosts = db.prepare(
      `SELECT p.id, p.body, p.createdAt, p.likeCount, p.commentCount, s.collectionId,
              u.username as authorUsername, pr.displayName as authorDisplayName, pr.avatarUrl as authorAvatarUrl
       FROM saves s
       JOIN posts p ON p.id = s.postId
       JOIN users u ON u.id = p.authorId
       JOIN profiles pr ON pr.userId = p.authorId
       WHERE s.userId = ? AND p.deletedAt IS NULL
       ORDER BY s.createdAt DESC LIMIT 100`
    ).all(session.sub);

    const savedOther = db.prepare(
      `SELECT ci.itemType, ci.itemId, ci.collectionId, ci.createdAt
       FROM collection_items ci
       JOIN collections c ON c.id = ci.collectionId
       WHERE c.userId = ? ORDER BY ci.createdAt DESC LIMIT 100`
    ).all(session.sub);

    return ok({ collections, savedPosts:filterVisiblePosts(savedPosts,session.sub), savedOther });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = createCollectionSchema.parse(await request.json());

    const existing = db.prepare(`SELECT id FROM collections WHERE userId = ? AND name = ?`)
      .get(session.sub, body.name);
    if (existing) throw new ApiError("name_taken", "You already have a collection with that name.", 409);

    const id = newId();
    db.prepare(`INSERT INTO collections (id, userId, name) VALUES (?, ?, ?)`).run(id, session.sub, body.name);
    return ok({ id, name: body.name }, 201);
  } catch (err) {
    return handleError(err);
  }
}

const assignSchema = z.object({
  collectionId: z.string().nullable(),
  postId: z.string().optional(),
  itemType: z.enum(["event", "community"]).optional(),
  itemId: z.string().optional(),
});

/** Move a saved item into (or out of) a collection. Ownership verified both ways. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser();
    const body = assignSchema.parse(await request.json());

    if (body.collectionId) {
      const owned = db.prepare(`SELECT id FROM collections WHERE id = ? AND userId = ?`)
        .get(body.collectionId, session.sub);
      if (!owned) throw new ApiError("forbidden", "That collection isn't yours.", 403);
    }

    if (body.postId) {
      const save = db.prepare(`SELECT id FROM saves WHERE userId = ? AND postId = ?`)
        .get(session.sub, body.postId);
      if (!save) throw new ApiError("not_found", "Save that post first.", 404);
      db.prepare(`UPDATE saves SET collectionId = ? WHERE userId = ? AND postId = ?`)
        .run(body.collectionId, session.sub, body.postId);
      return ok({ updated: true });
    }

    if (body.itemType && body.itemId && body.collectionId) {
      db.prepare(
        `INSERT OR IGNORE INTO collection_items (id, collectionId, itemType, itemId) VALUES (?, ?, ?, ?)`
      ).run(newId(), body.collectionId, body.itemType, body.itemId);
      return ok({ updated: true });
    }

    throw new ApiError("validation_error", "Provide either a postId or an itemType + itemId.", 422);
  } catch (err) {
    return handleError(err);
  }
}
