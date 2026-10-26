import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { forgotPasswordSchema } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/api";
import { mailerService } from "@/services/mailer";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(clientKey(request, "forgot_password"), 5, 60_000);
    if (!rl.allowed) return fail("rate_limited", "Too many attempts. Try again shortly.", 429);

    const { email } = forgotPasswordSchema.parse(await request.json());
    const user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.toLowerCase()) as
      | { id: string }
      | undefined;

    // Always respond the same way whether or not the account exists —
    // otherwise this endpoint becomes an email-enumeration oracle.
    if (user) {
      const rawToken = randomBytes(32).toString("hex");
      db.prepare(
        `INSERT INTO password_reset_tokens (id, userId, tokenHash, expiresAt) VALUES (?, ?, ?, ?)`
      ).run(
        newId(),
        user.id,
        createHash("sha256").update(rawToken).digest("hex"),
        new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()
      );
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      await mailerService.sendPasswordResetEmail(email, `${appUrl}/reset-password?token=${rawToken}`);
    }

    return ok({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    return handleError(err);
  }
}
