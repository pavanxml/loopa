import Redis from "ioredis";

/**
 * Lazy Redis singleton. When REDIS_URL is unset, every consumer (rate
 * limiter, realtime bus) falls back to an in-process implementation — see
 * rateLimit.ts and services/realtime.ts — so the app still runs with zero
 * external dependencies for local development. Set REDIS_URL to get the
 * horizontally-scalable behavior.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return null;
  }
  client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  client.on("error", (err) => console.error("[redis] connection error:", err.message));
  return client;
}
