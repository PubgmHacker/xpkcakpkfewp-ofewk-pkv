import Redis from "ioredis";

/**
 * Lazy singleton Redis client.
 * Connects on first access (no Config needed at import time).
 * Used by: rooms.ts, admin.ts, ws-manager.ts
 */
let _redisInstance: Redis | null = null;

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redisInstance) {
      const url = process.env.REDIS_URL || "redis://localhost:6379";
      _redisInstance = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 200, 5000);
          return delay;
        },
      });
      _redisInstance.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });
      _redisInstance.on("connect", () => {
        console.log("[Redis] Connected");
      });
    }
    // @ts-expect-error — dynamic proxy to Redis methods
    const value = _redisInstance[prop];
    return typeof value === "function" ? value.bind(_redisInstance) : value;
  },
});

export function disconnectRedis(): void {
  if (_redisInstance) {
    _redisInstance.quit().catch(() => {});
    _redisInstance = null;
  }
}

// Redis key helpers
export const redisKeys = {
  roomState: (roomID: string) => `room:state:${roomID}`,
  roomParticipants: (roomID: string) => `room:participants:${roomID}`,
};
