import { SignJWT, jwtVerify } from "jose";

/**
 * Access/refresh token strategy:
 *  - Access token: short-lived (15 min) signed JWT, httpOnly cookie, holds
 *    {sub, username, role, sid}; session.ts checks current database state.
 *  - Refresh token: long-lived (30 days) opaque random string, httpOnly
 *    cookie, stored *hashed* in `refresh_tokens`, rotated on every use
 *    (old one revoked, new one issued) so a stolen refresh token has a
 *    single-use window before rotation detection can flag reuse.
 */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || /replace-with|changeme/i.test(secret)) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set a strong random value in .env (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: string;
  sid?: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role, sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer("loopa")
    .setAudience("loopa-web")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"], issuer: "loopa", audience: "loopa-web" });
    if (!payload.sub || typeof payload.username !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, username: payload.username, role: payload.role, sid: typeof payload.sid === "string" ? payload.sid : undefined };
  } catch {
    return null;
  }
}

export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
