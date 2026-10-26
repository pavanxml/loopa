"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { api, ApiClientError } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const [form, setForm] = useState({ emailOrUsername: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);

  // Only providers whose credentials are configured on the server get a button.
  useEffect(() => {
    api.get<{ providers: { id: string; label: string }[] }>("/api/auth/oauth/providers")
      .then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, []);

  const OAUTH_ERRORS: Record<string, string> = {
    access_denied: "Sign-in was cancelled.",
    invalid_state: "That sign-in attempt expired or was invalid. Please try again.",
    email_unverified: "An account with this email already exists. Log in with your password, then connect this provider.",
    account_suspended: "This account has been suspended.",
    rate_limited: "Too many attempts. Try again shortly.",
  };
  const oauthError = searchParams.get("oauth_error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/api/auth/login", form);
      show("Welcome back!", "success");
      const destination=searchParams.get("next");
      router.push(destination&&destination.startsWith("/")&&!destination.startsWith("//")&&!/[\\\u0000-\u001f]/.test(destination)?destination:"/home");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.error.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to keep looping.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="emailOrUsername" className="mb-1 block text-sm font-medium">
            Email or username
          </label>
          <input
            id="emailOrUsername"
            className="input"
            value={form.emailOrUsername}
            onChange={(e) => setForm({ ...form, emailOrUsername: e.target.value })}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-loop-600 hover:underline">
              Forgot?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            autoComplete="current-password"
          />
        </div>
        {(formError || oauthError) && (
          <p className="text-sm text-red-500" role="alert">
            {formError ?? OAUTH_ERRORS[oauthError!] ?? "Sign-in failed. Please try again."}
          </p>
        )}
        <button type="submit" className="btn-primary mt-2 w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      {providers.length > 0 && (
        <div className="mt-5 flex flex-col gap-2 border-t border-[rgb(var(--border))] pt-5">
          {providers.map((p) => (
            <a key={p.id} className="btn-ghost w-full border border-[rgb(var(--border))]"
              href={`/api/auth/oauth/${p.id}?next=${encodeURIComponent(searchParams.get("next") ?? "/home")}`}>
              Continue with {p.label}
            </a>
          ))}
        </div>
      )}
      <p className="mt-5 text-center text-sm text-[rgb(var(--text-muted))]">
        New to LOOPA?{" "}
        <Link href="/signup" className="font-semibold text-loop-600 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary so the rest of the page
  // can be statically prerendered while this part bails out to the client.
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-[rgb(var(--text-muted))]">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
