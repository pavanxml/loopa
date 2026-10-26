import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { createSession } from "@/lib/session";
import { completeOAuthLogin } from "@/lib/oauthLogin";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { exchangeCodeForProfile, isProviderEnabled, isProviderId, statesMatch } from "@/services/oauth";

const OAUTH_COOKIE = "loopa_oauth";

function backToLogin(request: NextRequest, code: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("oauth_error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderId(provider) || !isProviderEnabled(provider)) return backToLogin(request, "provider_unavailable");

  const rl = await checkRateLimit(clientKey(request, "oauth_callback"), 20, 60_000);
  if (!rl.allowed) return backToLogin(request, "rate_limited");

  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE); // single use, success or failure

  let saved: { state?: string; verifier?: string; next?: string; provider?: string } = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { /* treated as missing below */ }

  const q = new URL(request.url).searchParams;
  if (q.get("error")) return backToLogin(request, "access_denied");

  // CSRF check: the state we issued must come back unchanged, for this provider.
  if (!saved.verifier || saved.provider !== provider || !statesMatch(saved.state, q.get("state"))) {
    return backToLogin(request, "invalid_state");
  }
  const code = q.get("code");
  if (!code) return backToLogin(request, "missing_code");

  try {
    const profile = await exchangeCodeForProfile(provider, code, saved.verifier);
    const result = await completeOAuthLogin(provider, profile);
    await createSession({ id: result.userId, username: result.username, role: result.role });

    const next = saved.next && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/home";
    return NextResponse.redirect(new URL(next, request.url));
  } catch (err) {
    if (err instanceof ApiError) return backToLogin(request, err.code);
    console.error("[oauth] callback failed:", (err as Error).message);
    return backToLogin(request, "oauth_failed");
  }
}
