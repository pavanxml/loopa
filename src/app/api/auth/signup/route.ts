import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { db,transaction } from "@/lib/db";
import { newId } from "@/lib/id";
import { hashPassword } from "@/lib/password";
import { signupSchema } from "@/lib/validation";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { createSession } from "@/lib/session";
import { mailerService } from "@/services/mailer";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(clientKey(request, "signup"), 10, 60_000);
    if (!rl.allowed) return fail("rate_limited", "Too many attempts. Try again shortly.", 429);

    const body = signupSchema.parse(await request.json());

    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ? OR username = ?`)
      .get(body.email.toLowerCase(), body.username) as { id: string } | undefined;
    if (existing) {
      throw new ApiError("email_or_username_taken", "That email or username is already in use.", 409);
    }

    const userId = newId();
    const passwordHash = await hashPassword(body.password);
    const rawToken = randomBytes(32).toString("hex");
    transaction(()=>{

    db.prepare(
      `INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, ?)`
    ).run(userId, body.email.toLowerCase(), body.username, passwordHash);

    db.prepare(
      `INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, ?)`
    ).run(newId(), userId, body.displayName);

    // Email verification token — stored hashed, raw value only ever leaves via the email link.
    db.prepare(
      `INSERT INTO email_verification_tokens (id, userId, tokenHash, expiresAt) VALUES (?, ?, ?, ?)`
    ).run(
      newId(),
      userId,
      createHash("sha256").update(rawToken).digest("hex"),
      new Date(Date.now() + EMAIL_TOKEN_TTL_MS).toISOString()
    );
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await mailerService.sendVerificationEmail(body.email, `${appUrl}/verify-email?token=${rawToken}`);

    await createSession({ id: userId, username: body.username, role: "user" });

    return ok(
      { id: userId, username: body.username, displayName: body.displayName, emailVerified: false },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
