"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/apiClient";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    api
      .post("/api/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <AuthShell title="Email verification">
      <div className="text-center text-sm">
        {status === "pending" && <p>Verifying…</p>}
        {status === "success" && <p>Your email is verified. You&apos;re all set.</p>}
        {status === "error" && <p>This link is invalid or has expired.</p>}
        <Link href="/home" className="mt-4 inline-block font-semibold text-loop-600 hover:underline">
          Go to LOOPA
        </Link>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams() requires a Suspense boundary so the rest of the page
  // can be statically prerendered while this part bails out to the client.
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-[rgb(var(--text-muted))]">Loading…</main>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
