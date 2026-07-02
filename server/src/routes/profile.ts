import { FastifyInstance } from "fastify";
import { prisma } from "../config/db.js";

// MARK: - Profile Routes (History + Stats)
export async function profileRoutes(fastify: FastifyInstance) {
  // ── Get my watch history ──────────────────────────────────
  fastify.get(
    "/me/history",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const history = await prisma.watchHistory.findMany({
        where: { userID: userId },
        orderBy: { watchedAt: "desc" },
        take: 50,
      });

      return reply.send(history);
    }
  );

  // ── Add to watch history ──────────────────────────────────
  fastify.post(
    "/me/history",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { mediaTitle, mediaPoster, mediaType, roomID, durationWatched } =
        request.body as any;

      if (!mediaTitle) {
        return reply.status(400).send({ error: "mediaTitle is required" });
      }

      const entry = await prisma.watchHistory.create({
        data: {
          userID: userId,
          roomID: roomID ?? null,
          mediaTitle,
          mediaPoster: mediaPoster ?? null,
          mediaType: mediaType ?? "video",
          durationWatched: durationWatched ?? 0,
        },
      });

      return reply.send(entry);
    }
  );

  // ── Get my stats ──────────────────────────────────────────
  fastify.get(
    "/me/stats",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;

      const [friendsCount, roomsJoined, history] = await Promise.all([
        prisma.friendship.count({
          where: {
            OR: [{ userAID: userId }, { userBID: userId }],
          },
        }),
        prisma.membership.count({ where: { userID: userId } }),
        prisma.watchHistory.findMany({
          where: { userID: userId },
          select: { durationWatched: true },
        }),
      ]);

      const totalSeconds = history.reduce(
        (sum, h) => sum + h.durationWatched,
        0
      );
      const totalHoursWatched = Math.round(totalSeconds / 3600);

      return reply.send({
        friendsCount,
        roomsJoined,
        totalHoursWatched,
        sessionsCount: history.length,
      });
    }
  );

  // ── Get another user's stats ──────────────────────────────
  fastify.get(
    "/:userId/stats",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const { userId } = request.params as { userId: string };

      const [user, friendsCount, roomsJoined, history] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            avatarURL: true,
            isOnline: true,
            isPremium: true,
            createdAt: true,
          },
        }),
        prisma.friendship.count({
          where: {
            OR: [{ userAID: userId }, { userBID: userId }],
          },
        }),
        prisma.membership.count({ where: { userID: userId } }),
        prisma.watchHistory.findMany({
          where: { userID: userId },
          select: { durationWatched: true, mediaTitle: true, mediaPoster: true, mediaType: true, watchedAt: true },
          orderBy: { watchedAt: "desc" },
          take: 20,
        }),
      ]);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const totalSeconds = history.reduce(
        (sum, h) => sum + h.durationWatched,
        0
      );

      return reply.send({
        ...user,
        friendsCount,
        roomsJoined,
        totalHoursWatched: Math.round(totalSeconds / 3600),
        history,
      });
    }
  );

  // ── Premium status ────────────────────────────────────────
  fastify.get(
    "/me/premium-status",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true, premiumUntil: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({
        isPremium: user.isPremium,
        expirationDate: user.premiumUntil,
      });
    }
  );

  // ── Create subscription (MVP stub) ────────────────────────
  fastify.post(
    "/me/create-subscription",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { plan } = request.body as { plan: string };

      const days: Record<string, number> = {
        monthly: 30,
        quarterly: 90,
        yearly: 365,
      };
      const durationDays = days[plan] ?? 30;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          isPremium: true,
          premiumUntil: new Date(Date.now() + durationDays * 86400000),
        },
        select: {
          id: true,
          username: true,
          isPremium: true,
          premiumUntil: true,
        },
      });

      return reply.send(updated);
    }
  );
}
