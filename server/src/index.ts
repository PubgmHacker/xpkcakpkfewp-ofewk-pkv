import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./config/index.js";
import { prisma } from "./config/db.js";
import { redis, disconnectRedis } from "./config/redis.js";
import { YouTubeService } from "./services/youtube.js";
import { PushService } from "./services/push.js";
import authPlugin from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { roomRoutes } from "./routes/rooms.js";
import { mediaRoutes } from "./routes/media.js";
import { wsHandler } from "./websocket/ws-handler.js";

// ─── Boot ────────────────────────────────────────────

async function main() {
  const config = loadConfig(console as any);

  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === "development" ? "debug" : "info",
      transport:
        config.nodeEnv === "development"
          ? {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "SYS:yyyy-mm-dd HH:MM:ss" },
            }
          : undefined,
    },
  });

  // Store config on fastify instance for plugin access
  fastify.decorate("config", config);

  // ─── Plugins ───────────────────────────────────────

  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder: (_request, _context) => ({
      error: "Too many requests. Try again later.",
      statusCode: 429,
    }),
  });

  // Auth plugin (JWT + authenticate decorator)
  await fastify.register(authPlugin);

  // ─── Services ───────────────────────────────────────

  // Redis — ленивый синглтон (подключается при первом обращении)
  // Используем единый прокси из config/redis.ts
  fastify.decorate("redis", redis);

  const youtubeService = new YouTubeService(
    fastify.log,
    config.ytdlpPath
  );
  fastify.decorate("youtubeService", youtubeService);

  const pushService = new PushService(fastify.log, {
    firebaseProjectId: config.firebaseProjectId,
    firebasePrivateKey: config.firebasePrivateKey,
    firebaseClientEmail: config.firebaseClientEmail,
  });
  fastify.decorate("pushService", pushService);

  // ─── Routes ─────────────────────────────────────────

  // Health check
  fastify.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
  }));

  // API routes (versioned)
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(roomRoutes, { prefix: "/api/rooms" });
  await fastify.register(mediaRoutes, { prefix: "/api/media" });

  // ─── WebSocket ─────────────────────────────────────

  await fastify.register(wsHandler);

  // ─── Start ──────────────────────────────────────────

  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
    fastify.log.info(`🚀 SyncWatch Server running on port ${config.port}`);
    fastify.log.info(`   REST:  http://localhost:${config.port}/api`);
    fastify.log.info(`   WS:    ws://localhost:${config.port}/ws`);
    fastify.log.info(`   Health: http://localhost:${config.port}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal} — shutting down gracefully...`);

    // Close WebSocket connections
    const manager = (fastify as any).wsManager;
    if (manager) {
      fastify.log.info("Closing WebSocket connections...");
    }

    await fastify.close();
    disconnectRedis();
    await prisma.$disconnect();

    fastify.log.info("Server shut down complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ─── Type Augmentations ──────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    config: ReturnType<typeof loadConfig>;
    redis: import("ioredis").default;
    youtubeService: YouTubeService;
    pushService: PushService;
  }
}

// ─── Run ─────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
