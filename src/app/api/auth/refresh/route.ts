import { ok, fail, handleError } from "@/lib/api";
import { refreshSession } from "@/lib/session";

export async function POST() {
  try {
    const user = await refreshSession();
    if (!user) return fail("invalid_refresh_token", "Session expired. Please sign in again.", 401);
    return ok({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    return handleError(err);
  }
}
