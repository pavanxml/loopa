import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/session";

/**
 * Every API route returns this envelope so the frontend never has to
 * special-case response shape per-endpoint:
 *   { ok: true,  data: T }
 *   { ok: false, error: { code, message, fields? } }
 */
export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(code: string, message: string, status: number, fields?: Record<string, string[]>) {
  return NextResponse.json({ ok: false, error: { code, message, fields } }, { status });
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** Wraps a route handler with consistent error → response translation and logging. */
export function withApiErrors(handler: () => Promise<NextResponse>) {
  return async (): Promise<NextResponse> => {
    try {
      return await handler();
    } catch (err) {
      return handleError(err);
    }
  };
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof SyntaxError) return fail("invalid_json", "Send a valid JSON request.", 400);
  if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) return fail("conflict", "That value already exists.", 409);
  // Next.js signals "this route reads cookies/headers, so it's dynamic" by
  // THROWING during its static-generation probe. A catch-all must let that
  // pass through, or the framework's own control flow gets logged (and
  // handled) as a server error.
  if (typeof err === "object" && err !== null && (err as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE") {
    throw err;
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    return fail("validation_error", "Some fields need attention.", 422, fields);
  }
  if (err instanceof AuthError) {
    return fail("unauthenticated", "Please sign in to continue.", 401);
  }
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.status);
  }
  // Structured server-side log — never leak internals to the client.
  console.error(JSON.stringify({ event: "api_error", type: err instanceof Error ? err.name : "unknown", at: new Date().toISOString() }));
  return fail("internal_error", "Something went wrong on our end. Please try again.", 500);
}
