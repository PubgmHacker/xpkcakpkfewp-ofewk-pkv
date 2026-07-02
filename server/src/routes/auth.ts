import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";

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

// ─── Password hashing (bcrypt) ──

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

    // Guest accounts cannot sign in with password
    if (user.passwordHash === "GUEST" || user.passwordHash.startsWith("SOCIAL:")) {
      return reply.status(401).send({ error: "Use social login for this account" });
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
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

  // POST /api/auth/signout
  fastify.post(
    "/signout",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user!;

      // Update online status and clear FCM token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isOnline: false,
          lastSeenAt: new Date(),
          fcmToken: null,
        },
      });

      return reply.send({ success: true });
    }
  );
}
