/**
 * OAuth 2.0 Authorization Code flow with PKCE (RFC 7636) + state (CSRF).
 *
 * HONEST STATUS: this is the complete, real flow — but it has NOT been run
 * against live Google/GitHub, because that requires client credentials
 * registered to your own domain, which can't exist in the sandbox this was
 * built in. What WAS verified: PKCE against the RFC 7636 published test
 * vector, state validation, URL construction, and the full code-exchange +
 * profile-fetch path against a local stand-in provider server (see
 * tests/oauth.test.ts — a stand-in for the provider's two HTTP endpoints,
 * not a claim about Google itself). Verify against the real providers
 * before shipping.
 *
 * A provider is enabled ONLY when its env vars are set; otherwise it is
 * absent from /api/auth/oauth/providers and the login UI shows no button.
 */
import { createHash, randomBytes } from "node:crypto";

export type ProviderId = "google" | "github";

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

interface ProviderConfig {
  id: ProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  parseProfile(json: Record<string, unknown>): OAuthProfile;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    parseProfile: (j) => ({
      providerAccountId: String(j.sub ?? ""),
      email: typeof j.email === "string" ? j.email : null,
      emailVerified: j.email_verified === true,
      name: typeof j.name === "string" ? j.name : null,
      avatarUrl: typeof j.picture === "string" ? j.picture : null,
    }),
  },
  github: {
    id: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    // GitHub's /user returns a possibly-null public email with no
    // verification flag, so it is treated as UNVERIFIED here: it will never
    // be used to auto-link to an existing account (see completeOAuthLogin).
    parseProfile: (j) => ({
      providerAccountId: String(j.id ?? ""),
      email: typeof j.email === "string" ? j.email : null,
      emailVerified: false,
      name: typeof j.name === "string" ? j.name : typeof j.login === "string" ? j.login : null,
      avatarUrl: typeof j.avatar_url === "string" ? j.avatar_url : null,
    }),
  },
};

type EndpointOverride = Partial<Pick<ProviderConfig, "authorizeUrl" | "tokenUrl" | "userinfoUrl">>;
const endpointOverrides: Partial<Record<ProviderId, EndpointOverride>> = {};

/** Test seam: lets tests point a provider at a local stand-in server. */
export function __setEndpointOverrideForTests(id: ProviderId, o: EndpointOverride) {
  endpointOverrides[id] = o;
}

function resolved(id: ProviderId): ProviderConfig {
  return { ...PROVIDERS[id], ...endpointOverrides[id] };
}

export function isProviderId(v: string): v is ProviderId {
  return v === "google" || v === "github";
}

export function isProviderEnabled(id: ProviderId): boolean {
  const c = PROVIDERS[id];
  return !!process.env[c.clientIdEnv] && !!process.env[c.clientSecretEnv];
}

export function enabledProviders(): { id: ProviderId; label: string }[] {
  return (Object.keys(PROVIDERS) as ProviderId[])
    .filter(isProviderEnabled)
    .map((id) => ({ id, label: PROVIDERS[id].label }));
}

// ---------------------------- PKCE + state ----------------------------

const b64url = (buf: Buffer) => buf.toString("base64url");

export function generateVerifier(): string {
  return b64url(randomBytes(48)); // 64 chars, within RFC 7636's 43–128
}

export function challengeFor(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest()); // S256
}

export function generateState(): string {
  return b64url(randomBytes(24));
}

export function redirectUri(id: ProviderId): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/oauth/${id}/callback`;
}

export function buildAuthorizationUrl(id: ProviderId, state: string, verifier: string): string {
  const c = resolved(id);
  const url = new URL(c.authorizeUrl);
  url.searchParams.set("client_id", process.env[c.clientIdEnv] ?? "");
  url.searchParams.set("redirect_uri", redirectUri(id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Both must be non-empty and equal; compared without early exit. */
export function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// ------------------------- code exchange + profile -------------------------

export async function exchangeCodeForProfile(id: ProviderId, code: string, verifier: string): Promise<OAuthProfile> {
  const c = resolved(id);

  const tokenRes = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(id),
      client_id: process.env[c.clientIdEnv] ?? "",
      client_secret: process.env[c.clientSecretEnv] ?? "",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("token response had no access_token");

  const infoRes = await fetch(c.userinfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json", "User-Agent": "LOOPA" },
  });
  if (!infoRes.ok) throw new Error(`userinfo fetch failed (${infoRes.status})`);

  const profile = c.parseProfile((await infoRes.json()) as Record<string, unknown>);
  if (!profile.providerAccountId) throw new Error("provider returned no account id");
  return profile;
}
