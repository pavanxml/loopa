import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, transaction } from "@/lib/db";
import {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  type AccessTokenPayload,
} from "@/lib/jwt";

const ACCESS_COOKIE = "loopa_access",
  REFRESH_COOKIE = "loopa_refresh";
const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export interface SessionUser {
  id: string;
  username: string;
  role: string;
}

async function prepareSession(
  user: SessionUser,
  familyId: string = randomUUID(),
) {
  const id = randomUUID(),
    refresh = randomBytes(48).toString("base64url");
  const access = await signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    sid: id,
  });
  return { id, familyId, refresh, access, userId: user.id };
}
function persist(session: Awaited<ReturnType<typeof prepareSession>>) {
  db.prepare(
    `INSERT INTO refresh_tokens (id,userId,tokenHash,expiresAt,familyId) VALUES (?,?,?,?,?)`,
  ).run(
    session.id,
    session.userId,
    hashToken(session.refresh),
    new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    session.familyId,
  );
}
async function setCookies(session: Awaited<ReturnType<typeof prepareSession>>) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, session.access, {
    ...cookieBase,
    maxAge: ACCESS_TOKEN_TTL_MS / 1000,
  });
  jar.set(REFRESH_COOKIE, session.refresh, {
    ...cookieBase,
    maxAge: REFRESH_TOKEN_TTL_MS / 1000,
  });
}
export async function createSession(user: SessionUser): Promise<void> {
  const session = await prepareSession(user);
  persist(session);
  await setCookies(session);
}
export async function refreshSession(): Promise<SessionUser | null> {
  const jar = await cookies(),
    refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const row = db
    .prepare(
      `SELECT rt.id, rt.familyId, rt.userId, rt.expiresAt, rt.revokedAt, u.username, u.role, u.status
    FROM refresh_tokens rt JOIN users u ON u.id=rt.userId WHERE rt.tokenHash=?`,
    )
    .get(hashToken(refresh)) as
    | {
        id: string;
        familyId: string | null;
        userId: string;
        expiresAt: string;
        revokedAt: string | null;
        username: string;
        role: string;
        status: string;
      }
    | undefined;
  if (
    !row ||
    row.status !== "active" ||
    new Date(row.expiresAt).getTime() <= Date.now()
  )
    return null;
  if (row.revokedAt) {
    db.prepare(
      `UPDATE refresh_tokens SET revokedAt=? WHERE userId=? AND familyId=?`,
    ).run(new Date().toISOString(), row.userId, row.familyId);
    return null;
  }
  const user = { id: row.userId, username: row.username, role: row.role };
  const next = await prepareSession(user, row.familyId ?? row.id);
  const rotated = transaction(() => {
    const result = db
      .prepare(
        `UPDATE refresh_tokens SET revokedAt=? WHERE id=? AND revokedAt IS NULL`,
      )
      .run(new Date().toISOString(), row.id);
    if (!result.changes) {
      db.prepare(
        `UPDATE refresh_tokens SET revokedAt=? WHERE userId=? AND familyId=?`,
      ).run(new Date().toISOString(), row.userId, next.familyId);
      return false;
    }
    persist(next);
    return true;
  });
  if (!rotated) return null;
  await setCookies(next);
  return user;
}
export async function destroySession(): Promise<void> {
  const jar = await cookies(),
    refresh = jar.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const row = db
      .prepare(`SELECT userId,familyId FROM refresh_tokens WHERE tokenHash=?`)
      .get(hashToken(refresh)) as
      | { userId: string; familyId: string | null }
      | undefined;
    if (row?.familyId)
      db.prepare(
        `UPDATE refresh_tokens SET revokedAt=? WHERE userId=? AND familyId=?`,
      ).run(new Date().toISOString(), row.userId, row.familyId);
    else
      db.prepare(`UPDATE refresh_tokens SET revokedAt=? WHERE tokenHash=?`).run(
        new Date().toISOString(),
        hashToken(refresh),
      );
  }
  jar.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
}
export async function getCurrentUser(): Promise<AccessTokenPayload | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sid) return null;
  const row = db
    .prepare(
      `SELECT u.username,u.role FROM users u JOIN refresh_tokens rt ON rt.userId=u.id
    WHERE u.id=? AND u.status='active' AND rt.id=? AND rt.revokedAt IS NULL AND julianday(rt.expiresAt)>julianday('now')`,
    )
    .get(payload.sub, payload.sid) as
    | { username: string; role: string }
    | undefined;
  return row ? { ...payload, ...row } : null;
}
export async function requireUser(): Promise<AccessTokenPayload> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated");
  return user;
}
export class AuthError extends Error {}
