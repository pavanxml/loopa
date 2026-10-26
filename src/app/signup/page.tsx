"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { FieldError } from "@/components/AuthShell";
import { api, ApiClientError } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";

export default function SignupPage() {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState({ email: "", username: "", password: "", displayName: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await api.post("/api/auth/signup", form);
      show("Welcome to LOOPA! Check your email to verify your account.", "success");
      router.push("/home");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(err.error.fields ?? {});
        setFormError(err.error.fields ? null : err.error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Join LOOPA" subtitle="People, content, and communities worth your time.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
            Display name
          </label>
          <input
            id="displayName"
            className="input"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
            maxLength={50}
            autoComplete="name"
          />
          <FieldError messages={fieldErrors.displayName} />
        </div>
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
            required
            pattern="[a-z0-9_]{3,24}"
            autoComplete="username"
            placeholder="lowercase, numbers, underscores"
          />
          <FieldError messages={fieldErrors.username} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoComplete="email"
          />
          <FieldError messages={fieldErrors.email} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <FieldError messages={fieldErrors.password} />
        </div>
        {formError && (
          <p className="text-sm text-red-500" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn-primary mt-2 w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-[rgb(var(--text-muted))]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-loop-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
