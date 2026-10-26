import { NextRequest } from "next/server";
import { db, transaction } from "@/lib/db";
import { visiblePost } from "@/lib/postAccess";
import { newId } from "@/lib/id";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { notifyIfEnabled } from "@/lib/notifications";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: postId } = await params;

    return transaction(() => {
    const post = visiblePost(postId,session.sub);
    const existing = db.prepare(`SELECT id FROM likes WHERE userId = ? AND postId = ?`).get(session.sub, postId);

    if (existing) {
      db.prepare(`DELETE FROM likes WHERE userId = ? AND postId = ?`).run(session.sub, postId);
      db.prepare(`UPDATE posts SET likeCount = MAX(0, likeCount - 1) WHERE id = ?`).run(postId);
      return ok({ liked: false });
    }

    db.prepare(`INSERT INTO likes (id, userId, postId) VALUES (?, ?, ?)`).run(newId(), session.sub, postId);
    db.prepare(`UPDATE posts SET likeCount = likeCount + 1 WHERE id = ?`).run(postId);

    notifyIfEnabled(post.authorId, session.sub, "like", "post", postId);

    return ok({ liked: true });
    });
  } catch (err) {
    return handleError(err);
  }
}
