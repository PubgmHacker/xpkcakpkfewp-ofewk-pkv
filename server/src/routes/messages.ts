import { FastifyInstance } from "fastify";
import { prisma } from "../config/db.js";

// MARK: - Messages Routes (DM + Room Chat)
export async function messagesRoutes(fastify: FastifyInstance) {
  // ── Send DM message ───────────────────────────────────────
  fastify.post(
    "/dm",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { receiverId, content } = request.body as {
        receiverId: string;
        content: string;
      };

      if (!receiverId || !content?.trim()) {
        return reply.status(400).send({ error: "Missing fields" });
      }

      const msg = await prisma.dMMessage.create({
        data: {
          senderID: userId,
          receiverID: receiverId,
          content: content.trim(),
        },
      });

      return reply.send({
        id: msg.id,
        senderID: msg.senderID,
        receiverID: msg.receiverID,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    }
  );

  // ── Get DM history with a friend ──────────────────────────
  fastify.get(
    "/dm/:friendId",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const userId = request.user!.id;
      const { friendId } = request.params as { friendId: string };

      const messages = await prisma.dMMessage.findMany({
        where: {
          OR: [
            { senderID: userId, receiverID: friendId },
            { senderID: friendId, receiverID: userId },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      });

      return reply.send(messages);
    }
  );

  // ── Get room chat history ─────────────────────────────────
  fastify.get(
    "/room/:roomId",
    { preHandler: [fastify.authenticate] },
    async (request: any, reply) => {
      const { roomId } = request.params as { roomId: string };

      const messages = await prisma.chatMessage.findMany({
        where: { roomID: roomId },
        orderBy: { createdAt: "asc" },
        take: 200,
      });

      return reply.send(messages);
    }
  );
}
