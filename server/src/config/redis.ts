import Redis from "ioredis";
import type { Config } from "./index.js";

/**
 * Ленивый синглтон Redis-клиента.
 * Подключается при первом обращении (не требует Config при импорте).
 * Используется модулями: rooms.ts, admin.ts, ws-manager.ts.
 */
let _redisInstance: Redis | null = null;

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redisInstance) {
      // Ленивая инициализация: читаем URL из env или дефолт
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
    // @ts-expect-error — динамический прокси к методам Redis
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

export function createRedisClient(config: Config): Redis {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    lazyConnect: true,
  });

  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  client.on("connect", () => {
    console.log("[Redis] Connected");
  });

  return client;
}

// Redis key helpers
export const redisKeys = {
  roomState: (roomID: string) => `room:state:${roomID}`,
  roomParticipants: (roomID: string) => `room:participants:${roomID}`,
  userOnline: (userID: string) => `user:online:${userID}`,
  userFCM: (userID: string) => `user:fcm:${userID}`,
};
