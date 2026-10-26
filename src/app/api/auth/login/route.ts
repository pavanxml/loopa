import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { createSession } from "@/lib/session";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP AND by the identifier being guessed, so distributed
    // guessing against one account is throttled even from many IPs.
    const rlIp = await checkRateLimit(clientKey(request, "login"), 20, 60_000);
    if (!rlIp.allowed) return fail("rate_limited", "Too many attempts. Try again shortly.", 429);

    const body = loginSchema.parse(await request.json());
    const rlUser = await checkRateLimit(`login_user:${body.emailOrUsername.toLowerCase()}`, 8, 60_000);
    if (!rlUser.allowed) return fail("rate_limited", "Too many attempts for this account. Try again shortly.", 429);

    const identifier = body.emailOrUsername.toLowerCase();
    const user = db
      .prepare(`SELECT id, username, role, status, passwordHash FROM users WHERE email = ? OR username = ?`)
      .get(identifier, body.emailOrUsername) as
      | { id: string; username: string; role: string; status: string; passwordHash: string }
      | undefined;

    // Same generic error whether the account doesn't exist or the password
    // is wrong — don't leak which one via the error message.
    const genericError = () => new ApiError("invalid_credentials", "Incorrect email/username or password.", 401);

    if (!user) {
      await verifyPassword(body.password,"$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
      throw genericError();
    }
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw genericError();

    if (user.status === "suspended") {
      throw new ApiError("account_suspended", "This account has been suspended.", 403);
    }
    if (user.status === "deactivated") {
      db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(user.id);
    }
    if (user.status === "deleted") throw genericError();

    await createSession({ id: user.id, username: user.username, role: user.role });

    return ok({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    return handleError(err);
  }
}
