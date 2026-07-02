import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { redis, redisKeys } from "../config/redis.js";

// ─────────────────────────────────────────────────────────────────────────────
//  admin-routes.ts — Глобальный администратор приложения (Super Admin)
//
//  Роль 'admin' в модели User имеет глобальные права во всём приложении:
//    • DELETE  /api/admin/rooms/:id           — удалить ЛЮБУЮ комнату
//    • POST    /api/admin/rooms/:id/end-stream — завершить стрим в ЛЮБОЙ комнате
//    • POST    /api/admin/users/:id/ban        — забанить ЛЮБОГО пользователя
//    • POST    /api/admin/users/:id/unban      — разбанить пользователя
//    • POST    /api/admin/users/:id/role       — изменить роль пользователя
//    • GET     /api/admin/users                — список всех пользователей
//    • GET     /api/admin/reports              — список жалоб на модерацию
//    • POST    /api/admin/rooms/:id/kick/:userId — кикнуть из ЛЮБОЙ комнаты
//
//  Все роуты защищены middleware requireAdmin — пропускает только role=ADMIN.
// ─────────────────────────────────────────────────────────────────────────────

export async function adminRoutes(fastify: FastifyInstance) {
  // ─── Общий guard: проверка роли ADMIN на каждом запросе ─────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    // Применяем только к админ-роутам
    if (!request.url.startsWith("/api/admin")) return;

    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Load actual role from DB (don't trust JWT alone)
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, bannedUntil: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin access required" });
    }

    // Check ban
    if (dbUser.bannedUntil && dbUser.bannedUntil > new Date()) {
      return reply.status(403).send({ error: "Admin account is banned" });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  КОМНАТЫ
  // ═════════════════════════════════════════════════════════════════════════

  // ─── DELETE /api/admin/rooms/:id — удалить любую комнату ────────────────
  fastify.delete("/rooms/:id", async (request, reply) => {
    const { id: roomID } = request.params as { id: string };

    const room = await prisma.room.findUnique({ where: { id: roomID } });
    if (!room) {
      return reply.status(404).send({ error: "Room not found" });
    }

    // Deactivate + notify participants via WS
    await prisma.room.update({
      where: { id: roomID },
      data: { isActive: false },
    });

    // Очистка Redis
    await redis.del(redisKeys.roomState(roomID));
    await redis.del(redisKeys.roomParticipants(roomID));

    // WS-бродкаст: комната закрыта администратором
    const wsManager = (fastify as any).wsManager;
    if (wsManager) {
      wsManager.broadcastToRoom(roomID, {
        type: "room_closed",
        roomID,
        reason: "admin_action",
        message: "Room closed by administrator",
        timestamp: Date.now(),
      });
    }

    request.log.info({
      adminID: request.user!.id,
      roomID,
      roomName: room.name,
    }, "[ADMIN] Room deleted");

    return reply.send({ success: true, message: "Room deleted" });
  });

  // ─── POST /api/admin/rooms/:id/end-stream — завершить стрим ─────────────
  fastify.post("/rooms/:id/end-stream", async (request, reply) => {
    const { id: roomID } = request.params as { id: string };

    const room = await prisma.room.findUnique({ where: { id: roomID } });
    if (!room) {
      return reply.status(404).send({ error: "Room not found" });
    }

    // Reset media
    await prisma.room.update({
      where: { id: roomID },
      data: {
        mediaItemID: null,
        mediaStreamURL: null,
        mediaTitle: null,
        mediaThumbnailURL: null,
      },
    });

    // WS-бродкаст: медиа сброшено
    const wsManager = (fastify as any).wsManager;
    if (wsManager) {
      wsManager.broadcastToRoom(roomID, {
        type: "chat",
        id: `sys_${Date.now()}`,
        roomID,
        senderID: "system",
        senderName: "Администратор",
        senderRole: "admin",
        text: "🎬 Stream ended by administrator",
        timestamp: new Date().toISOString(),
        isSystem: true,
        systemType: "info",
        severity: "warning",
      });

      // Команда остановки воспроизведения для всех клиентов
      wsManager.broadcastToRoom(roomID, {
        command: "pause",
        roomID,
        senderID: request.user!.id,
        mediaTime: 0,
        timestamp: Date.now() / 1000,
      });
    }

    return reply.send({ success: true, message: "Stream ended" });
  });

  // ─── POST /api/admin/rooms/:id/kick/:userId — кикнуть из любой комнаты ──
  fastify.post("/rooms/:id/kick/:userId", async (request, reply) => {
    const { id: roomID, userId } = request.params as { id: string; userId: string };
    const adminID = request.user!.id;

    // Удаляем участника из БД
    await prisma.membership.deleteMany({
      where: { roomID, userID: userId },
    });

    await redis.srem(redisKeys.roomParticipants(roomID), userId);

    // WS: отключаем пользователя от комнаты + системное сообщение
    const wsManager = (fastify as any).wsManager;
    if (wsManager) {
      // Принудительное отключение
      wsManager.kickUserFromRoom(roomID, userId);

      // Системное сообщение
      wsManager.broadcastToRoom(roomID, {
        type: "chat",
        id: `sys_${Date.now()}`,
        roomID,
        senderID: "system",
        senderName: "Система",
        senderRole: "admin",
        text: "🔨 User removed by administrator",
        timestamp: new Date().toISOString(),
        isSystem: true,
        systemType: "kick",
        severity: "critical",
      });
    }

    request.log.info({ adminID, roomID, kickedUserID: userId }, "[ADMIN] User kicked");

    return reply.send({ success: true, message: "User kicked" });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  ПОЛЬЗОВАТЕЛИ
  // ═════════════════════════════════════════════════════════════════════════

  // ─── GET /api/admin/users — список всех пользователей ───────────────────
  fastify.get("/users", async (request, reply) => {
    const query = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(parseInt(query.limit || "50"), 200);
    const offset = parseInt(query.offset || "0");

    const where = query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, username: true, email: true, role: true,
          isPremium: true, isOnline: true, bannedUntil: true,
          warningsCount: true, createdAt: true, lastSeenAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({ users, total, limit, offset });
  });

  // ─── POST /api/admin/users/:id/ban — забанить пользователя ──────────────
  fastify.post("/users/:id/ban", async (request, reply) => {
    const { id: userID } = request.params as { id: string };
    const body = z.object({
      durationHours: z.number().min(1).max(24 * 365).default(24),
      reason: z.string().min(3).max(500),
    }).parse(request.body);

    // Нельзя забанить другого админа
    const target = await prisma.user.findUnique({ where: { id: userID }, select: { role: true } });
    if (!target) {
      return reply.status(404).send({ error: "User not found" });
    }
    if (target.role === "ADMIN") {
      return reply.status(403).send({ error: "Cannot ban an administrator" });
    }

    const bannedUntil = new Date(Date.now() + body.durationHours * 3600 * 1000);

    await prisma.user.update({
      where: { id: userID },
      data: { bannedUntil, bannedReason: body.reason },
    });

    // Отключаем от всех активных WS-сессий
    const wsManager = (fastify as any).wsManager;
    if (wsManager) {
      wsManager.disconnectUserEverywhere(userID, `Banned: ${body.reason}`);
    }

    request.log.info({
      adminID: request.user!.id,
      bannedUserID: userID,
      duration: body.durationHours,
      reason: body.reason,
    }, "[ADMIN] User banned");

    return reply.send({
      success: true,
      message: `User banned for ${body.durationHours}h`,
      bannedUntil,
    });
  });

  // ─── POST /api/admin/users/:id/unban — разбанить ────────────────────────
  fastify.post("/users/:id/unban", async (request, reply) => {
    const { id: userID } = request.params as { id: string };

    await prisma.user.update({
      where: { id: userID },
      data: { bannedUntil: null, bannedReason: null, warningsCount: 0 },
    });

    return reply.send({ success: true, message: "User unbanned" });
  });

  // ─── POST /api/admin/users/:id/role — изменить роль ────────────────────
  fastify.post("/users/:id/role", async (request, reply) => {
    const { id: userID } = request.params as { id: string };
    const { role } = z.object({
      role: z.enum(["USER", "MODERATOR", "FOUNDER", "ADMIN"]),
    }).parse(request.body);

    await prisma.user.update({
      where: { id: userID },
      data: { role },
    });

    request.log.info({
      adminID: request.user!.id,
      targetUserID: userID,
      newRole: role,
    }, "[ADMIN] Role changed");

    return reply.send({ success: true, message: `Role changed to ${role}` });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  ЖАЛОБЫ (модерация)
  // ═════════════════════════════════════════════════════════════════════════

  // ─── GET /api/admin/reports — список жалоб ──────────────────────────────
  fastify.get("/reports", async (request, reply) => {
    const query = request.query as { resolved?: string };
    const resolved = query.resolved === "true" ? true : query.resolved === "false" ? false : undefined;

    const reports = await prisma.roomReport.findMany({
      where: resolved === undefined ? {} : { resolved },
      include: {
        room: { select: { id: true, name: true, hostName: true } },
        reporter: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return reply.send({ reports });
  });

  // ─── POST /api/admin/reports/:id/resolve — отметить жалобу решённой ─────
  fastify.post("/reports/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.roomReport.update({
      where: { id },
      data: { resolved: true },
    });

    return reply.send({ success: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Расширение WebSocketManager — методы для админ-операций
//  (добавляются в ws-manager.ts, здесь — декларация контракта)
// ─────────────────────────────────────────────────────────────────────────────

declare module "../websocket/ws-manager.js" {
  interface WebSocketManager {
    /** Принудительно отключить пользователя от конкретной комнаты. */
    kickUserFromRoom(roomID: string, userID: string): void;
    /** Отключить пользователя от ВСЕХ WS-соединений (глобальный бан). */
    disconnectUserEverywhere(userID: string, reason: string): void;
    /** Публичный бродкаст в комнату (для использования из admin-routes). */
    broadcastToRoom(roomID: string, data: unknown): void;
  }
}
