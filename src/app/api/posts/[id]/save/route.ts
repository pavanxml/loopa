import { NextRequest } from "next/server";
import { db, transaction } from "@/lib/db";
import { visiblePost } from "@/lib/postAccess";
import { newId } from "@/lib/id";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: postId } = await params;

    return transaction(() => {
    visiblePost(postId,session.sub);
    const existing = db.prepare(`SELECT id FROM saves WHERE userId = ? AND postId = ?`).get(session.sub, postId);
    if (existing) {
      db.prepare(`DELETE FROM saves WHERE userId = ? AND postId = ?`).run(session.sub, postId);
      db.prepare(`UPDATE posts SET saveCount = MAX(0, saveCount - 1) WHERE id = ?`).run(postId);
      return ok({ saved: false });
    }

    db.prepare(`INSERT INTO saves (id, userId, postId) VALUES (?, ?, ?)`).run(newId(), session.sub, postId);
    db.prepare(`UPDATE posts SET saveCount = saveCount + 1 WHERE id = ?`).run(postId);
    return ok({ saved: true });
    });
  } catch (err) {
    return handleError(err);
  }
}
