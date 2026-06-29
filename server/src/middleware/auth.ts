import type { FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { Config } from "../config/index.js";
import { prisma } from "../config/db.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
      email: string;
    };
  }
}

export default fp(
  async function authPlugin(fastify) {
    // Register JWT
    fastify.register(jwt, {
      secret: fastify.config.jwtSecret,
      sign: {
        expiresIn: fastify.config.jwtExpiresIn,
      },
    });

    // Authentication hook — can be used per-route via preHandler
    fastify.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const token = extractToken(request.headers.authorization);
        if (!token) {
          return reply.status(401).send({ error: "Missing authorization token" });
        }

        const payload = await request.jwtVerify<{ sub: string }>();
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, username: true, email: true },
        });

        if (!user) {
          return reply.status(401).send({ error: "User not found" });
        }

        request.user = user;
      } catch (err) {
        if (err instanceof Error && err.message === "Unauthorized") {
          return reply.status(401).send({ error: "Invalid or expired token" });
        }
        fastify.log.error(err);
        return reply.status(500).send({ error: "Authentication error" });
      }
    });
  },
  {
    name: "auth-plugin",
  }
);

function extractToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
