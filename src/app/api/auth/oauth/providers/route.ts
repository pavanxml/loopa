import { ok } from "@/lib/api";
import { enabledProviders } from "@/services/oauth";

// Must be evaluated per request: it reads process.env, which differs between
// build time and runtime. Without this, Next pre-renders the response during
// `next build` (no cookies/headers are read, so it looks static) and freezes
// whatever providers happened to be configured at build time.
export const dynamic = "force-dynamic";

/** Which sign-in providers are actually configured. The login UI renders only these. */
export async function GET() {
  return ok({ providers: enabledProviders() });
}
