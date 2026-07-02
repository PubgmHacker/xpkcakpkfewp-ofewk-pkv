import { FastifyInstance } from "fastify";
import { prisma } from "../config/db.js";

// MARK: - Friends Routes
export async function friendsRoutes(fastify: FastifyInstance) {
  // ── Search users by username ──────────────────────────────
  fastify.get(
    "/search",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const q = (request.query as any).q as string;
      if (!q || q.length < 2) {
        return reply.send([]);
      }
      const cleanQuery = q.replace(/^@/, "").trim();
      const users = await prisma.user.findMany({
        where: {
          username: { contains: cleanQuery, mode: "insensitive" },
        },
        select: {
          id: true,
          username: true,
          avatarURL: true,
          isOnline: true,
        },
        take: 20,
      });
      return reply.send(users);
    }
  );

  // ── Send friend request ───────────────────────────────────
  fastify.post(
    "/request",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { friendId } = request.body as { friendId: string };

      if (!friendId || friendId === userId) {
        return reply.status(400).send({ error: "Invalid friend ID" });
      }

      // Check if already friends
      const existingFriend = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAID: userId, userBID: friendId },
            { userAID: friendId, userBID: userId },
          ],
        },
      });
      if (existingFriend) {
        return reply.status(400).send({ error: "Already friends" });
      }

      // Check if request already exists
      const existingReq = await prisma.friendRequest.findFirst({
        where: {
          OR: [
            { fromUserID: userId, toUserID: friendId },
            { fromUserID: friendId, toUserID: userId },
          ],
          status: "pending",
        },
      });
      if (existingReq) {
        return reply.status(400).send({ error: "Request already exists" });
      }

      const req = await prisma.friendRequest.create({
        data: {
          fromUserID: userId,
          toUserID: friendId,
        },
      });

      return reply.send(req);
    }
  );

  // ── Get incoming friend requests ──────────────────────────
  fastify.get(
    "/requests/incoming",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const requests = await prisma.friendRequest.findMany({
        where: { toUserID: userId, status: "pending" },
        include: {
          fromUser: {
            select: {
              id: true,
              username: true,
              avatarURL: true,
              isOnline: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send(
        requests.map((r) => ({
          id: r.id,
          fromUser: r.fromUser,
          toUserId: userId,
          status: r.status,
          createdAt: r.createdAt,
          isIncoming: true,
        }))
      );
    }
  );

  // ── Accept or reject friend request ───────────────────────
  fastify.put(
    "/requests/:requestId",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { requestId } = request.params as { requestId: string };
      const { status } = request.body as { status: string };

      if (status !== "accepted" && status !== "rejected") {
        return reply.status(400).send({ error: "Invalid status" });
      }

      const req = await prisma.friendRequest.findUnique({
        where: { id: requestId },
      });
      if (!req || req.toUserID !== userId) {
        return reply.status(404).send({ error: "Request not found" });
      }

      await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status },
      });

      if (status === "accepted") {
        // Create bidirectional friendship
        await prisma.friendship.create({
          data: {
            userAID: req.fromUserID,
            userBID: userId,
          },
        });
      }

      return reply.send({ success: true });
    }
  );

  // ── Get friends list ──────────────────────────────────────
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ userAID: userId }, { userBID: userId }],
        },
        include: {
          userA: {
            select: {
              id: true,
              username: true,
              avatarURL: true,
              isOnline: true,
              lastSeenAt: true,
            },
          },
          userB: {
            select: {
              id: true,
              username: true,
              avatarURL: true,
              isOnline: true,
              lastSeenAt: true,
            },
          },
        },
      });

      const friends = friendships.map((f) => {
        const friend = f.userAID === userId ? f.userB : f.userA;
        return {
          id: friend.id,
          username: friend.username,
          avatarURL: friend.avatarURL,
          isOnline: friend.isOnline,
          lastSeen: friend.lastSeenAt,
          friendsSince: f.createdAt,
        };
      });

      return reply.send(friends);
    }
  );

  // ── Remove friend ─────────────────────────────────────────
  fastify.delete(
    "/:friendId",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { friendId } = request.params as { friendId: string };

      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { userAID: userId, userBID: friendId },
            { userAID: friendId, userBID: userId },
          ],
        },
      });

      return reply.send({ success: true });
    }
  );
}
