import { NextRequest } from "next/server";
import { db, transaction } from "@/lib/db";
import { visiblePost } from "@/lib/postAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { newId } from "@/lib/id";
import { createCommentSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser, getCurrentUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const viewer=await getCurrentUser();
    visiblePost(postId,viewer?.sub??null);
    const rows = db
      .prepare(
        `SELECT c.id, c.body, c.parentId, c.likeCount, c.createdAt,
                u.username as authorUsername, p.displayName as authorDisplayName, p.avatarUrl as authorAvatarUrl
         FROM comments c
         JOIN users u ON u.id = c.authorId
         JOIN profiles p ON p.userId = c.authorId
         WHERE c.postId = ? AND c.status = 'published' AND c.deletedAt IS NULL
         ORDER BY c.createdAt ASC LIMIT 100`
      )
      .all(postId);
    return ok({ items: rows });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: postId } = await params;
    const body = createCommentSchema.parse(await request.json());

    if(!(await checkRateLimit(`comment:${session.sub}`,30,60000)).allowed) throw new ApiError("rate_limited","Please wait before commenting again.",429);
    const post = visiblePost(postId,session.sub);
    if(body.parentId&&!db.prepare(`SELECT 1 FROM comments WHERE id=? AND postId=? AND deletedAt IS NULL`).get(body.parentId,postId))throw new ApiError("invalid_parent","Reply must belong to this post.",422);

    const profile=db.prepare(`SELECT commentPolicy FROM profiles WHERE userId=?`).get(post.authorId) as {commentPolicy:string};
    if (post.commentPolicy === "none" || profile.commentPolicy === "none") {
      throw new ApiError("comments_disabled", "Comments are disabled on this post.", 403);
    }
    if ((post.commentPolicy === "followers" || profile.commentPolicy === "followers") && post.authorId !== session.sub) {
      const isFollower = db
        .prepare(`SELECT 1 FROM follows WHERE followerId = ? AND followingId = ?`)
        .get(session.sub, post.authorId);
      if (!isFollower) throw new ApiError("comments_restricted", "Only followers can comment on this post.", 403);
    }

    const commentId = newId();
    transaction(()=>{
    db.prepare(`INSERT INTO comments (id, postId, authorId, parentId, body) VALUES (?, ?, ?, ?, ?)`).run(
      commentId,
      postId,
      session.sub,
      body.parentId ?? null,
      body.body
    );
    db.prepare(`UPDATE posts SET commentCount = commentCount + 1 WHERE id = ?`).run(postId);

    notifyIfEnabled(post.authorId, session.sub, "comment", "post", postId);
    });

    return ok({ id: commentId }, 201);
  } catch (err) {
    return handleError(err);
  }
}
