import { db } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) return fail("unauthenticated", "Not signed in.", 401);

    const user = db
      .prepare(
        `SELECT u.id, u.email, u.username, u.emailVerifiedAt, u.role, u.status, u.createdAt,
                p.displayName, p.avatarUrl, p.bio, p.location, p.website, p.skills
         FROM users u JOIN profiles p ON p.userId = u.id
         WHERE u.id = ?`
      )
      .get(session.sub);

    if (!user) return fail("not_found", "User not found.", 404);
    return ok(user);
  } catch (err) {
    return handleError(err);
  }
}
