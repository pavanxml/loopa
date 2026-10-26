import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { z } from "zod";

const schema = z.object({ token: z.string().min(10) });

export async function POST(request: NextRequest) {
  try {
    const { token } = schema.parse(await request.json());
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const row = db
      .prepare(`SELECT id, userId, expiresAt, usedAt FROM email_verification_tokens WHERE tokenHash = ?`)
      .get(tokenHash) as { id: string; userId: string; expiresAt: string; usedAt: string | null } | undefined;

    if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) {
      return fail("invalid_token", "This verification link is invalid or has expired.", 400);
    }

    db.prepare(`UPDATE email_verification_tokens SET usedAt = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(`UPDATE users SET emailVerifiedAt = datetime('now') WHERE id = ?`).run(row.userId);

    return ok({ verified: true });
  } catch (err) {
    return handleError(err);
  }
}
