import { getRedis } from "@/lib/redis";

/**
 * Sliding-window-ish rate limiter with two backends behind one interface:
 *
 *  - Redis (when REDIS_URL is set): INCR + PEXPIRE, correct across any
 *    number of app instances since the counter lives in one shared store.
 *  - In-memory Map (fallback): correct for a single process only. Fine for
 *    local dev; NOT correct if you run multiple instances without Redis.
 *
 * Call sites never know which backend is active.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if(memoryBuckets.size>1000){for(const[k,b]of memoryBuckets)if(b.resetAt<=now)memoryBuckets.delete(k);}
  if(memoryBuckets.size>=10000&&!memoryBuckets.has(key))return{allowed:false,remaining:0,resetAt:now+windowMs};
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

async function checkInRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redis = getRedis()!;
  const redisKey = `ratelimit:${key}`;
  try {
    const [count,ttl] = await redis.eval(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('PTTL',KEYS[1])}`,1,redisKey,windowMs) as [number,number];
    const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (err) {
    // Redis hiccup shouldn't take the whole API down — fail open to the
    // in-memory limiter for this one check rather than 500ing every request.
    console.error("[rateLimit] shared store unavailable");
    if(process.env.NODE_ENV==="production")return{allowed:false,remaining:0,resetAt:Date.now()+windowMs};
    return checkInMemory(key, limit, windowMs);
  }
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redis = getRedis();
  return redis ? checkInRedis(key, limit, windowMs) : checkInMemory(key, limit, windowMs);
}

export function clientKey(request: Request, scope: string): string {
  // Forwarded headers are trusted only behind a proxy that overwrites them.
  if(process.env.TRUST_PROXY!=="true")return `${scope}:direct`;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `${scope}:${ip}`;
}
