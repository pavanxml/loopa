import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fail } from "@/lib/api";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import {
  buildAuthorizationUrl, generateState, generateVerifier, isProviderEnabled, isProviderId,
} from "@/services/oauth";

const OAUTH_COOKIE = "loopa_oauth"; // not exported: Next route files may only export HTTP handlers/config

/** Starts the flow: stores state + PKCE verifier in a short-lived httpOnly cookie, redirects to the provider. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderId(provider) || !isProviderEnabled(provider)) {
    return fail("provider_unavailable", "That sign-in method isn't available.", 404);
  }
  const rl = await checkRateLimit(clientKey(request, "oauth_start"), 20, 60_000);
  if (!rl.allowed) return fail("rate_limited", "Too many attempts. Try again shortly.", 429);

  const state = generateState();
  const verifier = generateVerifier();

  // Only same-site relative paths are honored as the post-login destination
  // (blocks open-redirect via ?next=https://evil.example).
  const nextParam = new URL(request.url).searchParams.get("next") ?? "/home";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";

  const jar = await cookies();
  jar.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next, provider }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from the provider
    path: "/api/auth/oauth",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(buildAuthorizationUrl(provider, state, verifier));
}
