import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { hashPassword } from "@/lib/password";
import { ApiError } from "@/lib/api";
import { usernameSchema } from "@/lib/validation";
import type { OAuthProfile, ProviderId } from "@/services/oauth";

export interface OAuthLoginResult {
  userId: string;
  username: string;
  role: string;
  created: boolean;
}

interface UserRow { id: string; username: string; role: string; status: string }

function assertUsable(u: UserRow): void {
  if (u.status === "suspended") throw new ApiError("account_suspended", "This account has been suspended.", 403);
  if (u.status === "deleted") throw new ApiError("invalid_credentials", "This account is no longer available.", 401);
}

/** Derives a valid, unique username from an email local-part or display name. */
export function generateUsername(seed: string | null): string {
  let base = (seed ?? "user").toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/^\d+$/, "u$&").slice(0, 18);
  if (base.length < 3) base = `user${base}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${randomBytes(2).toString("hex")}`;
    if (!usernameSchema.safeParse(candidate).success) continue; // reserved/invalid -> try a suffixed one
    const taken = db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(candidate);
    if (!taken) return candidate;
  }
  return `user${randomBytes(5).toString("hex")}`;
}

/**
 * Resolves an external identity to a LOOPA user:
 *  1. Already linked            -> that user.
 *  2. Verified email matches    -> link to that existing user.
 *  3. UNVERIFIED email matches  -> refuse. Auto-linking on an email the
 *     provider doesn't vouch for would let anyone who can set that email on
 *     a provider account take over the existing LOOPA account.
 *  4. Otherwise                 -> create a new user.
 */
export async function completeOAuthLogin(provider: ProviderId, profile: OAuthProfile): Promise<OAuthLoginResult> {
  const linked = db.prepare(
    `SELECT u.id, u.username, u.role, u.status FROM oauth_accounts oa
     JOIN users u ON u.id = oa.userId WHERE oa.provider = ? AND oa.providerAccountId = ?`
  ).get(provider, profile.providerAccountId) as UserRow | undefined;
  if (linked) {
    assertUsable(linked);
    return { userId: linked.id, username: linked.username, role: linked.role, created: false };
  }

  const email = profile.email?.toLowerCase() ?? null;
  if (email) {
    const existing = db.prepare(`SELECT id, username, role, status FROM users WHERE email = ?`).get(email) as UserRow | undefined;
    if (existing) {
      if (!profile.emailVerified) {
        throw new ApiError(
          "email_unverified",
          "An account with this email already exists. Log in with your password, then connect this provider.",
          409
        );
      }
      assertUsable(existing);
      db.prepare(`INSERT INTO oauth_accounts (id, userId, provider, providerAccountId) VALUES (?, ?, ?, ?)`)
        .run(newId(), existing.id, provider, profile.providerAccountId);
      return { userId: existing.id, username: existing.username, role: existing.role, created: false };
    }
  }

  const userId = newId();
  const username = generateUsername(email ? email.split("@")[0]! : profile.name);
  // OAuth-only accounts get a random, unknowable password hash: password
  // login is impossible until the user sets one via "forgot password".
  const unusableHash = await hashPassword(randomBytes(32).toString("hex"));
  const storedEmail = email ?? `${provider}_${profile.providerAccountId}@oauth.loopa.invalid`;

  db.prepare(
    `INSERT INTO users (id, email, emailVerifiedAt, username, passwordHash) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, storedEmail, email && profile.emailVerified ? new Date().toISOString() : null, username, unusableHash);
  db.prepare(`INSERT INTO profiles (id, userId, displayName, avatarUrl) VALUES (?, ?, ?, ?)`)
    .run(newId(), userId, (profile.name ?? username).slice(0, 50), profile.avatarUrl);
  db.prepare(`INSERT INTO oauth_accounts (id, userId, provider, providerAccountId) VALUES (?, ?, ?, ?)`)
    .run(newId(), userId, provider, profile.providerAccountId);

  return { userId, username, role: "user", created: true };
}
