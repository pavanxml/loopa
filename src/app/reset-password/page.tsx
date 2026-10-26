"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { api, ApiClientError } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      show("Password updated — please log in.", "success");
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <p className="text-center text-sm text-[rgb(var(--text-muted))]">
          This reset link is missing its token.{" "}
          <Link href="/forgot-password" className="font-semibold text-loop-600 hover:underline">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams() requires a Suspense boundary so the rest of the page
  // can be statically prerendered while this part bails out to the client.
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-[rgb(var(--text-muted))]">Loading…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
