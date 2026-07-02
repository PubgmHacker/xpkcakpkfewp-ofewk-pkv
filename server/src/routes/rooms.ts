import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { generateRoomCode } from "../utils/index.js";
import { redis, redisKeys } from "../config/redis.js";
import { ROOM_STATE_TTL } from "../config/index.js";

// ─── Validation ───────────────────────────────────────

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  maxParticipants: z.number().min(2).max(20).default(10),
  mediaItem: z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string().optional(),
    thumbnailURL: z.string().optional(),
    streamURL: z.string().url(),
    duration: z.number().optional(),
    mediaType: z.enum(["movie", "series", "music", "video", "livestream"]),
    source: z.enum(["url", "youtube", "vimeo", "plex", "jellyfin", "local"]),
  }).optional(),
});

const joinRoomSchema = z.object({
  code: z.string().length(6).toUpperCase(),
});

// ─── Routes ──────────────────────────────────────────

export async function roomRoutes(fastify: FastifyInstance) {
  // GET /api/rooms — list active rooms
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const rooms = await prisma.room.findMany({
        where: { isActive: true },
        include: {
          host: { select: { id: true, username: true, avatarURL: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true, avatarURL: true, isOnline: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return reply.send(
        rooms.map((room) => ({
          id: room.id,
          name: room.name,
          code: room.code,
          hostID: room.hostID,
          hostName: room.hostName,
          participants: room.memberships.map((m) => ({
            id: m.user.id,
            username: m.user.username,
            avatarURL: m.user.avatarURL,
            isOnline: m.user.isOnline,
          })),
          mediaItem: room.mediaItemID
            ? {
                id: room.mediaItemID,
                title: room.mediaTitle ?? "",
                thumbnailURL: room.mediaThumbnailURL ?? undefined,
                streamURL: room.mediaStreamURL ?? "",
                duration: room.mediaDuration ?? undefined,
                mediaType: room.mediaType,
                source: room.mediaSource,
              }
            : null,
          isActive: room.isActive,
          maxParticipants: room.maxParticipants,
          createdAt: room.createdAt,
        }))
      );
    }
  );

  // GET /api/rooms/:id
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          host: { select: { id: true, username: true, avatarURL: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true, avatarURL: true, isOnline: true } },
            },
          },
        },
      });

      if (!room) {
        return reply.status(404).send({ error: "Room not found" });
      }

      return reply.send({
        id: room.id,
        name: room.name,
        code: room.code,
        hostID: room.hostID,
        hostName: room.hostName,
        participants: room.memberships.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          avatarURL: m.user.avatarURL,
          isOnline: m.user.isOnline,
        })),
        mediaItem: room.mediaItemID
          ? {
              id: room.mediaItemID,
              title: room.mediaTitle ?? "",
              thumbnailURL: room.mediaThumbnailURL ?? undefined,
              streamURL: room.mediaStreamURL ?? "",
              duration: room.mediaDuration ?? undefined,
              mediaType: room.mediaType,
              source: room.mediaSource,
            }
          : null,
        isActive: room.isActive,
        maxParticipants: room.maxParticipants,
        createdAt: room.createdAt,
      });
    }
  );

  // POST /api/rooms — create room
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const body = createRoomSchema.parse(request.body);

      // Generate unique room code
      let code = generateRoomCode();
      while (await prisma.room.findUnique({ where: { code } })) {
        code = generateRoomCode();
      }

      const room = await prisma.room.create({
        data: {
          name: body.name,
          code,
          hostID: user.id,
          hostName: user.username,
          maxParticipants: body.maxParticipants,
          mediaItemID: body.mediaItem?.id,
          mediaTitle: body.mediaItem?.title,
          mediaStreamURL: body.mediaItem?.streamURL,
          mediaThumbnailURL: body.mediaItem?.thumbnailURL,
          mediaType: body.mediaItem?.mediaType,
          mediaSource: body.mediaItem?.source,
          mediaDuration: body.mediaItem?.duration,
          memberships: {
            create: { userID: user.id },
          },
        },
        include: {
          host: { select: { id: true, username: true, avatarURL: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true, avatarURL: true, isOnline: true } },
            },
          },
        },
      });

      // Cache room state in Redis
      await redis.set(
        redisKeys.roomState(room.id),
        JSON.stringify({
          roomID: room.id,
          hostID: room.hostID,
          isPlaying: false,
          currentMediaTime: 0,
          mediaItemID: room.mediaItemID,
          participantIDs: [user.id],
          lastActivity: Date.now(),
        }),
        "EX",
        ROOM_STATE_TTL
      );

      // Track participant set
      await redis.sadd(redisKeys.roomParticipants(room.id), user.id);

      return reply.status(201).send({
        id: room.id,
        name: room.name,
        code: room.code,
        hostID: room.hostID,
        hostName: room.hostName,
        participants: room.memberships.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          avatarURL: m.user.avatarURL,
          isOnline: m.user.isOnline,
        })),
        mediaItem: room.mediaItemID
          ? {
              id: room.mediaItemID,
              title: room.mediaTitle ?? "",
              thumbnailURL: room.mediaThumbnailURL ?? undefined,
              streamURL: room.mediaStreamURL ?? "",
              duration: room.mediaDuration ?? undefined,
              mediaType: room.mediaType,
              source: room.mediaSource,
            }
          : null,
        isActive: room.isActive,
        maxParticipants: room.maxParticipants,
        createdAt: room.createdAt,
      });
    }
  );

  // POST /api/rooms/join — join by code
  fastify.post(
    "/join",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const body = joinRoomSchema.parse(request.body);

      const room = await prisma.room.findUnique({
        where: { code: body.code },
        include: {
          host: { select: { id: true, username: true, avatarURL: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true, avatarURL: true, isOnline: true } },
            },
          },
        },
      });

      if (!room) {
        return reply.status(404).send({ error: "Room not found" });
      }

      if (!room.isActive) {
        return reply.status(410).send({ error: "Room is no longer active" });
      }

      if (room.memberships.length >= room.maxParticipants) {
        return reply.status(409).send({ error: "Room is full" });
      }

      // Check if already a member
      const existing = room.memberships.find((m) => m.userID === user.id);
      if (!existing) {
        await prisma.membership.create({
          data: { roomID: room.id, userID: user.id },
        });
        await redis.sadd(redisKeys.roomParticipants(room.id), user.id);
      }

      // Refresh room with new membership
      const updatedRoom = await prisma.room.findUnique({
        where: { id: room.id },
        include: {
          host: { select: { id: true, username: true, avatarURL: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true, avatarURL: true, isOnline: true } },
            },
          },
        },
      });

      return reply.send({
        id: updatedRoom!.id,
        name: updatedRoom!.name,
        code: updatedRoom!.code,
        hostID: updatedRoom!.hostID,
        hostName: updatedRoom!.hostName,
        participants: updatedRoom!.memberships.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          avatarURL: m.user.avatarURL,
          isOnline: m.user.isOnline,
        })),
        mediaItem: updatedRoom!.mediaItemID
          ? {
              id: updatedRoom!.mediaItemID,
              title: updatedRoom!.mediaTitle ?? "",
              thumbnailURL: updatedRoom!.mediaThumbnailURL ?? undefined,
              streamURL: updatedRoom!.mediaStreamURL ?? "",
              duration: updatedRoom!.mediaDuration ?? undefined,
              mediaType: updatedRoom!.mediaType,
              source: updatedRoom!.mediaSource,
            }
          : null,
        isActive: updatedRoom!.isActive,
        maxParticipants: updatedRoom!.maxParticipants,
        createdAt: updatedRoom!.createdAt,
      });
    }
  );

  // POST /api/rooms/:id/leave
  fastify.post(
    "/:id/leave",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { id: roomID } = request.params as { id: string };

      const room = await prisma.room.findUnique({ where: { id: roomID } });
      if (!room) {
        return reply.status(404).send({ error: "Room not found" });
      }

      await prisma.membership.deleteMany({
        where: { roomID, userID: user.id },
      });

      await redis.srem(redisKeys.roomParticipants(roomID), user.id);

      // If host leaves, deactivate room
      if (room.hostID === user.id) {
        await prisma.room.update({
          where: { id: roomID },
          data: { isActive: false },
        });
        await redis.del(redisKeys.roomState(roomID));
      }

      return reply.send({ success: true });
    }
  );

  // DELETE /api/rooms/:id
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { id: roomID } = request.params as { id: string };

      const room = await prisma.room.findUnique({ where: { id: roomID } });
      if (!room) {
        return reply.status(404).send({ error: "Room not found" });
      }

      if (room.hostID !== user.id) {
        return reply.status(403).send({ error: "Only the host can delete a room" });
      }

      await prisma.room.delete({ where: { id: roomID } });
      await redis.del(redisKeys.roomState(roomID));
      await redis.del(redisKeys.roomParticipants(roomID));

      return reply.send({ success: true });
    }
  );

  // POST /api/rooms/:id/report — DMCA / content violation
  fastify.post(
    "/:id/report",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { id: roomID } = request.params as { id: string };

      const schema = z.object({
        reason: z.string().min(10).max(2000),
      });
      const body = schema.parse(request.body);

      await prisma.roomReport.create({
        data: {
          roomID,
          reporterID: user.id,
          reason: body.reason,
        },
      });

      return reply.status(201).send({ success: true, message: "Report submitted" });
    }
  );

  // ─── GET /api/rooms/public — топ-5 общедоступных комнат ──────────────
  fastify.get(
    "/public",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const rooms = await prisma.room.findMany({
        where: { isActive: true },
        include: {
          memberships: { select: { userID: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      const result = rooms.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        hostID: r.hostID,
        hostName: r.hostName,
        isActive: r.isActive,
        maxParticipants: r.maxParticipants,
        participantCount: r.memberships.length,
        mediaItem: r.mediaStreamURL
          ? {
              id: r.mediaItemID ?? "",
              title: r.mediaTitle ?? "",
              thumbnailURL: r.mediaThumbnailURL,
              streamURL: r.mediaStreamURL,
              duration: r.mediaDuration,
              mediaType: r.mediaType ?? "video",
              source: r.mediaSource ?? "url",
            }
          : null,
        createdAt: r.createdAt,
      }));

      return reply.send(result);
    }
  );

  // ─── GET /api/rooms/mine — комнаты пользователя ─────────────────────
  fastify.get(
    "/mine",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;

      const memberships = await prisma.membership.findMany({
        where: { userID: user.id },
        include: {
          room: {
            include: {
              memberships: { select: { userID: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      });

      const result = memberships.map((m) => {
        const r = m.room;
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          hostID: r.hostID,
          hostName: r.hostName,
          isActive: r.isActive,
          maxParticipants: r.maxParticipants,
          participantCount: r.memberships.length,
          mediaItem: r.mediaStreamURL
            ? {
                id: r.mediaItemID ?? "",
                title: r.mediaTitle ?? "",
                thumbnailURL: r.mediaThumbnailURL,
                streamURL: r.mediaStreamURL,
                duration: r.mediaDuration,
                mediaType: r.mediaType ?? "video",
                source: r.mediaSource ?? "url",
              }
            : null,
          createdAt: r.createdAt,
        };
      });

      return reply.send(result);
    }
  );

  // ─── POST /api/rooms/:id/playback — обновить плейбек ───────────────
  fastify.post(
    "/:id/playback",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id: roomID } = request.params as { id: string };
      const { time, isPlaying } = request.body as {
        time: number;
        isPlaying: boolean;
      };

      await prisma.playbackState.upsert({
        where: { roomID },
        create: { roomID, currentTime: time, isPlaying },
        update: { currentTime: time, isPlaying },
      });

      return reply.send({ success: true });
    }
  );

  // ─── GET /api/rooms/:id/playback — получить плейбек ────────────────
  fastify.get(
    "/:id/playback",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id: roomID } = request.params as { id: string };
      const state = await prisma.playbackState.findUnique({
        where: { roomID },
      });
      return reply.send(state ?? { currentTime: 0, isPlaying: false });
    }
  );

  // ─── POST /api/rooms/:id/start — начать стрим ───────────────────────
  fastify.post(
    "/:id/start",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { id: roomID } = request.params as { id: string };

      const room = await prisma.room.findUnique({ where: { id: roomID } });
      if (!room) return reply.code(404).send({ error: "Room not found" });
      if (room.hostID !== user.id)
        return reply.code(403).send({ error: "Only host can start" });

      await prisma.room.update({
        where: { id: roomID },
        data: { isActive: true },
      });

      return reply.send({ success: true });
    }
  );
}
