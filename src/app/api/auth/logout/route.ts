import { ok, handleError } from "@/lib/api";
import { destroySession } from "@/lib/session";

export async function POST() {
  try {
    await destroySession();
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
