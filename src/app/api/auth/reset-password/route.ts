import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { db, transaction } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { resetPasswordSchema } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = resetPasswordSchema.parse(await request.json());
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const row = db
      .prepare(`SELECT id, userId, expiresAt, usedAt FROM password_reset_tokens WHERE tokenHash = ?`)
      .get(tokenHash) as { id: string; userId: string; expiresAt: string; usedAt: string | null } | undefined;

    if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) {
      return fail("invalid_token", "This reset link is invalid or has expired.", 400);
    }

    const passwordHash = await hashPassword(password);
    transaction(()=>{
    const consumed=db.prepare(`UPDATE password_reset_tokens SET usedAt=? WHERE id=? AND usedAt IS NULL AND julianday(expiresAt)>julianday('now')`).run(new Date().toISOString(),row.id);
    if(!consumed.changes)throw new ApiError("invalid_token","This reset link has already been used.",400);
    db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(passwordHash, row.userId);
    db.prepare(`UPDATE password_reset_tokens SET usedAt = datetime('now') WHERE id = ?`).run(row.id);
    // Invalidate all existing sessions on password change.
    db.prepare(`UPDATE refresh_tokens SET revokedAt = datetime('now') WHERE userId = ? AND revokedAt IS NULL`).run(
      row.userId
    );
    });

    return ok({ reset: true });
  } catch (err) {
    return handleError(err);
  }
}
