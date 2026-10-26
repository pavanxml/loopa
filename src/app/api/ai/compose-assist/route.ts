import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { aiService } from "@/services/ai";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

const schema = z.object({ draft: z.string().max(3000) });

/**
 * Server-only boundary for LOOPA AI's compose-assist features. The client
 * never talks to an AI provider directly and never sees a provider key —
 * it only ever calls this route, which calls `aiService` (see
 * src/services/ai.ts for the swappable provider interface).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const rl = await checkRateLimit(clientKey(request, `ai:${session.sub}`), 20, 60_000);
    if (!rl.allowed) return handleError(new Error("rate_limited"));

    const { draft } = schema.parse(await request.json());
    const [hashtags, caption] = await Promise.all([
      aiService.suggestHashtags(draft),
      aiService.suggestCaption(draft),
    ]);

    return ok({ hashtags, caption });
  } catch (err) {
    return handleError(err);
  }
}
