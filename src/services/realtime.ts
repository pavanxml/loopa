import RedisClient from "ioredis";

/**
 * Real-time transport — interface with two backends.
 *
 * Messaging uses genuine server push (SSE) rather than frontend polling.
 * Which backend fans that push out is a separate concern from the API:
 *
 *  - In-process (default, no REDIS_URL): works correctly for one instance.
 *  - Redis pub/sub (REDIS_URL set): a publish on any instance reaches every
 *    subscriber connected to that Redis. The current SQLite/local-media
 *    deployment remains single-host; transport alone does not scale storage.
 */
export type RealtimeEvent =
  | { type: "deleted"; conversationId: string; messageId: string }
  | { type: "message"; conversationId: string; payload: unknown }
  | { type: "typing"; conversationId: string; userId: string; username: string }
  | { type: "read"; conversationId: string; userId: string };

type Subscriber = (event: RealtimeEvent) => void;

interface RealtimeBus {
  subscribe(channel: string, fn: Subscriber): () => void;
  publish(channel: string, event: RealtimeEvent): void;
}

class InProcessRealtime implements RealtimeBus {
  private channels = new Map<string, Set<Subscriber>>();

  subscribe(channel: string, fn: Subscriber): () => void {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(fn);
    return () => {
      this.channels.get(channel)?.delete(fn);
      if (this.channels.get(channel)?.size === 0) this.channels.delete(channel);
    };
  }

  publish(channel: string, event: RealtimeEvent): void {
    for (const fn of this.channels.get(channel) ?? []) {
      try { fn(event); } catch { /* one dead subscriber must not break the others */ }
    }
  }
}

/**
 * Redis-backed bus. Two dedicated connections (pub/sub connections in Redis
 * are exclusive — a subscribing connection can't issue other commands), plus
 * a local in-process bus so each instance still only wakes the SSE
 * connections it's actually holding open, ref-counted so we don't
 * over-subscribe or unsubscribe out from under a second local listener.
 */
class RedisRealtime implements RealtimeBus {
  private pub: RedisClient;
  private sub: RedisClient;
  private local = new InProcessRealtime();
  private refCounts = new Map<string, number>();

  constructor(url: string) {
    this.pub = new RedisClient(url);
    this.sub = new RedisClient(url);
    this.pub.on("error", (err) => console.error("[realtime:pub] error", err.message));
    this.sub.on("error", (err) => console.error("[realtime:sub] error", err.message));
    this.sub.on("message", (channel: string, message: string) => {
      try {
        this.local.publish(channel, JSON.parse(message) as RealtimeEvent);
      } catch { /* malformed payload from another instance — drop it */ }
    });
  }

  subscribe(channel: string, fn: Subscriber): () => void {
    const count = this.refCounts.get(channel) ?? 0;
    if (count === 0) this.sub.subscribe(channel).catch((err) => console.error("[realtime] subscribe failed", err));
    this.refCounts.set(channel, count + 1);

    const unsubLocal = this.local.subscribe(channel, fn);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unsubLocal();
      const remaining = (this.refCounts.get(channel) ?? 1) - 1;
      if (remaining <= 0) {
        this.refCounts.delete(channel);
        this.sub.unsubscribe(channel).catch(() => {});
      } else {
        this.refCounts.set(channel, remaining);
      }
    };
  }

  publish(channel: string, event: RealtimeEvent): void {
    this.pub.publish(channel, JSON.stringify(event)).catch((err) =>
      console.error("[realtime] publish failed", err.message)
    );
  }
}

function createRealtime(): RealtimeBus {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      return new RedisRealtime(url);
    } catch (err) {
      console.error("[realtime] failed to init Redis backend, using in-process:", err);
    }
  }
  return new InProcessRealtime();
}

declare global {
  // eslint-disable-next-line no-var
  var __loopaRealtime: RealtimeBus | undefined;
}

export const realtime: RealtimeBus = global.__loopaRealtime ?? createRealtime();
global.__loopaRealtime = realtime;
