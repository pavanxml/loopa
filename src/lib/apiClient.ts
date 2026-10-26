export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export class ApiClientError extends Error {
  constructor(
    public error: ApiError,
    public status: number,
  ) {
    super(error.message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refreshCredentials() {
  const refresh = async () => {
    // A different tab may have rotated the shared cookie while this request waited.
    if (
      (
        await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        })
      ).ok
    )
      return true;
    return (
      await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "X-Loopa-Request": "1" },
      })
    ).ok;
  };
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("loopa-session-refresh", refresh)
    : refresh();
}
async function request<T>(
  path: string,
  init?: RequestInit,
  retry = true,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Loopa-Request": "1",
      ...init?.headers,
    },
    credentials: "include",
  });
  if (
    res.status === 401 &&
    retry &&
    (!path.startsWith("/api/auth/") || path === "/api/auth/me")
  ) {
    refreshing ??= refreshCredentials()
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    if (await refreshing) return request<T>(path, init, false);
  }

  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: ApiError }
    | null;

  if (!json)
    throw new ApiClientError(
      { code: "bad_response", message: "Unexpected server response." },
      res.status,
    );
  if (!json.ok) throw new ApiClientError(json.error, res.status);
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
