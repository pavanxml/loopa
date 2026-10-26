/**
 * OAuth tests. IMPORTANT scope note: nothing here talks to real Google or
 * GitHub. The token/userinfo tests run against a local stand-in HTTP server
 * implementing the two endpoints the flow needs — that verifies OUR
 * request construction and response handling, not the real providers'
 * behavior. See the header of src/services/oauth.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  challengeFor, generateVerifier, generateState, statesMatch, buildAuthorizationUrl,
  isProviderEnabled, enabledProviders, exchangeCodeForProfile, redirectUri,
  __setEndpointOverrideForTests,
} from "../src/services/oauth";
import { completeOAuthLogin, generateUsername } from "../src/lib/oauthLogin";
import { usernameSchema } from "../src/lib/validation";
import { verifyPassword } from "../src/lib/password";

describe("PKCE (RFC 7636)", () => {
  it("matches the RFC 7636 Appendix B published test vector", () => {
    // Verifier/challenge pair taken verbatim from RFC 7636, Appendix B.
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("generates verifiers within the RFC length bounds, URL-safe, and non-repeating", () => {
    const a = generateVerifier(), b = generateVerifier();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a.length).toBeLessThanOrEqual(128);
    expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(a).not.toBe(b);
  });
});

describe("state (CSRF)", () => {
  it("accepts an identical state", () => {
    const s = generateState();
    expect(statesMatch(s, s)).toBe(true);
  });
  it("rejects mismatched, missing, and empty states", () => {
    const s = generateState();
    expect(statesMatch(s, generateState())).toBe(false);
    expect(statesMatch(s, null)).toBe(false);
    expect(statesMatch(undefined, s)).toBe(false);
    expect(statesMatch("", "")).toBe(false);
  });
});

describe("provider enablement and authorization URL", () => {
  const saved = { ...process.env };
  afterAll(() => { process.env = saved; });

  it("is disabled until BOTH client id and secret are set", () => {
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isProviderEnabled("google")).toBe(false);
    process.env.GOOGLE_CLIENT_ID = "id-only";
    expect(isProviderEnabled("google")).toBe(false);
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(isProviderEnabled("google")).toBe(true);
    expect(enabledProviders().map((p) => p.id)).toContain("google");
  });

  it("builds an authorization URL with S256 PKCE, state, and the callback URI", () => {
    process.env.GITHUB_CLIENT_ID = "gh-id"; process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    process.env.APP_URL = "https://loopa.example";
    const verifier = generateVerifier(), state = generateState();
    const url = new URL(buildAuthorizationUrl("github", state, verifier));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("gh-id");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("code_challenge")).toBe(challengeFor(verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://loopa.example/api/auth/oauth/github/callback");
    expect(url.toString()).not.toContain(verifier); // the verifier itself must never be sent out
  });
});

describe("code exchange against a local stand-in provider", () => {
  let server: http.Server;
  let base = "";
  const received: { tokenBody?: URLSearchParams; authHeader?: string } = {};

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "stand-in-id"; process.env.GOOGLE_CLIENT_SECRET = "stand-in-secret";
    server = http.createServer((req, res) => {
      if (req.url === "/token" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          received.tokenBody = new URLSearchParams(body);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ access_token: "tok-123", token_type: "Bearer" }));
        });
      } else if (req.url === "/userinfo") {
        received.authHeader = req.headers.authorization;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ sub: "g-777", email: "Person@Example.com", email_verified: true, name: "Pat Person", picture: "https://x/p.png" }));
      } else if (req.url === "/token-fail") { res.statusCode = 400; res.end("{}"); }
      else { res.statusCode = 404; res.end(); }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends code + code_verifier + client credentials, then uses the bearer token for userinfo", async () => {
    __setEndpointOverrideForTests("google", { tokenUrl: `${base}/token`, userinfoUrl: `${base}/userinfo` });
    const profile = await exchangeCodeForProfile("google", "auth-code-xyz", "my-verifier");
    expect(received.tokenBody?.get("grant_type")).toBe("authorization_code");
    expect(received.tokenBody?.get("code")).toBe("auth-code-xyz");
    expect(received.tokenBody?.get("code_verifier")).toBe("my-verifier");
    expect(received.tokenBody?.get("client_id")).toBe("stand-in-id");
    expect(received.tokenBody?.get("redirect_uri")).toBe(redirectUri("google"));
    expect(received.authHeader).toBe("Bearer tok-123");
    expect(profile).toMatchObject({ providerAccountId: "g-777", emailVerified: true, name: "Pat Person" });
  });

  it("throws (rather than logging anyone in) when the token endpoint rejects the code", async () => {
    __setEndpointOverrideForTests("google", { tokenUrl: `${base}/token-fail`, userinfoUrl: `${base}/userinfo` });
    await expect(exchangeCodeForProfile("google", "bad", "v")).rejects.toThrow(/token exchange failed/);
  });
});

describe("completeOAuthLogin account resolution", () => {
  // Unique per run: the dev DB persists between test runs.
  const sfx = randomUUID().slice(0, 8);
  const prof = (id: string, email: string | null, verified: boolean) => ({
    providerAccountId: `${id}-${sfx}`, email, emailVerified: verified, name: "Some Name", avatarUrl: null,
  });

  it("creates a new user, profile, and link for a first-time identity", async () => {
    const r = await completeOAuthLogin("google", prof("new", `fresh_${sfx}@example.com`, true));
    expect(r.created).toBe(true);
    const u = db.prepare(`SELECT emailVerifiedAt FROM users WHERE id = ?`).get(r.userId) as { emailVerifiedAt: string | null };
    expect(u.emailVerifiedAt).toBeTruthy(); // provider vouched for it
    expect(db.prepare(`SELECT 1 FROM profiles WHERE userId = ?`).get(r.userId)).toBeTruthy();
  });

  it("returns the SAME user on a repeat login (idempotent, no duplicates)", async () => {
    const a = await completeOAuthLogin("google", prof("repeat", `rep_${sfx}@example.com`, true));
    const b = await completeOAuthLogin("google", prof("repeat", `rep_${sfx}@example.com`, true));
    expect(b.created).toBe(false);
    expect(b.userId).toBe(a.userId);
  });

  it("links to an existing account when the provider VERIFIES the matching email", async () => {
    const existingId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(existingId, `link_${sfx}@example.com`, `link_${sfx}`);
    db.prepare(`INSERT INTO profiles (id, userId, displayName) VALUES (?, ?, 'L')`).run(randomUUID(), existingId);
    const r = await completeOAuthLogin("google", prof("verified-link", `link_${sfx}@example.com`, true));
    expect(r.userId).toBe(existingId);
    expect(r.created).toBe(false);
  });

  it("REFUSES to link on an UNVERIFIED matching email (account-takeover guard)", async () => {
    const victimId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(victimId, `victim_${sfx}@example.com`, `victim_${sfx}`);
    await expect(completeOAuthLogin("github", prof("attacker", `victim_${sfx}@example.com`, false)))
      .rejects.toMatchObject({ code: "email_unverified" });
    expect(db.prepare(`SELECT 1 FROM oauth_accounts WHERE userId = ?`).get(victimId)).toBeUndefined();
  });

  it("blocks a suspended user from signing in via OAuth", async () => {
    const r = await completeOAuthLogin("google", prof("susp", `susp_${sfx}@example.com`, true));
    db.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(r.userId);
    await expect(completeOAuthLogin("google", prof("susp", `susp_${sfx}@example.com`, true)))
      .rejects.toMatchObject({ code: "account_suspended" });
  });

  it("handles a provider that returns no email by using a placeholder address", async () => {
    const r = await completeOAuthLogin("github", prof("noemail", null, false));
    const u = db.prepare(`SELECT email, emailVerifiedAt FROM users WHERE id = ?`).get(r.userId) as { email: string; emailVerifiedAt: string | null };
    expect(u.email).toMatch(/@oauth\.loopa\.invalid$/);
    expect(u.emailVerifiedAt).toBeNull();
  });

  it("stores an unusable password so password login can't succeed for OAuth-only users", async () => {
    const r = await completeOAuthLogin("google", prof("nopw", `nopw_${sfx}@example.com`, true));
    const row = db.prepare(`SELECT passwordHash FROM users WHERE id = ?`).get(r.userId) as { passwordHash: string };
    expect(await verifyPassword("", row.passwordHash)).toBe(false);
    expect(await verifyPassword("password", row.passwordHash)).toBe(false);
  });
});

describe("generateUsername", () => {
  it("never yields a reserved or invalid username", () => {
    for (const seed of ["admin", "loopa", "12345", "a", "", "!!", null, "Mixed.Case+tag"]) {
      expect(usernameSchema.safeParse(generateUsername(seed)).success).toBe(true);
    }
  });
  it("de-duplicates against existing usernames", () => {
    const id = randomUUID();
    const taken = `taken_${id.slice(0, 8)}`; // unique per run (dev DB persists)
    db.prepare(`INSERT INTO users (id, email, username, passwordHash) VALUES (?, ?, ?, 'x')`)
      .run(id, `tn_${id}@t.loopa`, taken);
    const generated = generateUsername(taken);
    expect(generated).not.toBe(taken);
    expect(generated.startsWith(taken)).toBe(true); // suffixed, not replaced
  });
});
