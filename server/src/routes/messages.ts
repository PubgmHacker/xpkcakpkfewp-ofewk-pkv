import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function messagesRoutes(fastify: FastifyInstance) {
  fastify.post("/dm", { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const userId = request.user.sub;
    const { receiverId, content } = request.body as { receiverId: string; content: string };
    if (!receiverId || !content?.trim()) return reply.code(400).send({ error: "Missing fields" });
    const msg = await prisma.dMMessage.create({ data: { senderID: userId, receiverID: receiverId, content: content.trim() } });
    return reply.send({ id: msg.id, senderID: msg.senderID, receiverID: msg.receiverID, content: msg.content, createdAt: msg.createdAt });
  });

  fastify.get("/dm/:friendId", { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const userId = request.user.sub;
    const { friendId } = request.params as { friendId: string };
    const messages = await prisma.dMMessage.findMany({ where: { OR: [{ senderID: userId, receiverID: friendId }, { senderID: friendId, receiverID: userId }] }, orderBy: { createdAt: "asc" }, take: 200 });
    return reply.send(messages);
  });

  fastify.get("/room/:roomId", { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { roomId } = request.params as { roomId: string };
    const messages = await prisma.chatMessage.findMany({ where: { roomID: roomId }, orderBy: { createdAt: "asc" }, take: 200 });
    return reply.send(messages);
  });
}
