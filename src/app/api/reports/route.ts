import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { reportSchema } from "@/lib/validation";
import { ok, handleError, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const rl = await checkRateLimit(clientKey(request, `report:${session.sub}`), 20, 60_000);
    if (!rl.allowed) return handleError(new ApiError("rate_limited", "Too many reports submitted.", 429));

    const body = reportSchema.parse(await request.json());
    if (!body.postId && !body.commentId && !body.reportedUserId) {
      throw new ApiError("validation_error", "A report needs a target.", 422);
    }

    db.prepare(
      `INSERT INTO reports (id, reporterId, reportedUserId, postId, commentId, reason, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId(),
      session.sub,
      body.reportedUserId ?? null,
      body.postId ?? null,
      body.commentId ?? null,
      body.reason,
      body.details ?? null
    );

    return ok({ submitted: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}
