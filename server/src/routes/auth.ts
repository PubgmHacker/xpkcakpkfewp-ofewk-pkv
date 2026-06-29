import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { safeJSONParse } from "../utils/index.js";

// ─── Validation Schemas ───────────────────────────────

const signUpSchema = z.object({
  email: z.string().email("Invalid email"),
  username: z.string().min(2).max(30).regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signInSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

// ─── Simple password hashing (use bcrypt in production) ──
// TODO: Replace with bcrypt for production
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "raveclone_salt_v1");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Routes ──────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/signup
  fastify.post("/signup", async (request, reply) => {
    const body = signUpSchema.parse(request.body);

    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.email }, { username: body.username }],
      },
    });

    if (existing) {
      const field = existing.email === body.email ? "email" : "username";
      return reply.status(409).send({ error: `${field} already taken` });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        username: body.username,
        passwordHash,
      },
    });

    const token = fastify.jwt.sign(
      { sub: user.id, username: user.username },
      { sub: user.id }
    );

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarURL: user.avatarURL,
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
    });
  });

  // POST /api/auth/signin
  fastify.post("/signin", async (request, reply) => {
    const body = signInSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const passwordHash = await hashPassword(body.password);
    if (passwordHash !== user.passwordHash) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    // Update online status
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeenAt: new Date() },
    });

    const token = fastify.jwt.sign(
      { sub: user.id, username: user.username },
      { sub: user.id }
    );

    return reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarURL: user.avatarURL,
        isOnline: true,
        createdAt: user.createdAt,
      },
    });
  });

  // GET /api/auth/me — get current user
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      return reply.send(user);
    }
  );

  // POST /api/auth/fcm-token — register push notification token
  fastify.post(
    "/fcm-token",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const schema = z.object({ token: z.string().min(1) });
      const body = schema.parse(request.body);
      const user = request.user!;

      await prisma.user.update({
        where: { id: user.id },
        data: { fcmToken: body.token },
      });

      return reply.send({ success: true });
    }
  );
}
