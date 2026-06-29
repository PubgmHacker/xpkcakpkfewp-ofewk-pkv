import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────────────────
//  auth-social.ts — Социальный и гостевой вход (JWT-авторизация)
//
//  Контракт (соответствует AuthScreen.tsx):
//    POST /api/auth/google   { idToken }      → верификация Google, upsert, JWT
//    POST /api/auth/apple    { idToken }      → верификация Apple, upsert, JWT
//    POST /api/auth/vk       { accessToken }  → верификация VK API, upsert, JWT
//    POST /api/auth/guest    {}               → генерация Raver_XXXX, JWT
//
//  Все методы возвращают одинаковый ответ:
//    { token: string, user: { id, username, email?, avatarURL?, isGuest } }
// ─────────────────────────────────────────────────────────────────────────────

const SOCIAL_PROVIDER = {
  GOOGLE: "google",
  APPLE: "apple",
  VK: "vk",
  GUEST: "guest",
} as const;

export async function authSocialRoutes(fastify: FastifyInstance) {
  // ─── 1. Google Sign-In ───────────────────────────────────────────────────
  fastify.post("/google", async (request, reply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(request.body);

    // Верификация id_token через Google.
    // В прод: google-auth-library → OAuth2Client.verifyIdToken()
    const profile = await verifyGoogleIdToken(idToken);
    if (!profile) {
      return reply.status(401).send({ error: "Invalid Google token" });
    }

    const user = await upsertSocialUser({
      provider: SOCIAL_PROVIDER.GOOGLE,
      providerUserId: profile.sub,
      email: profile.email,
      username: profile.name,
      avatarURL: profile.picture,
    });

    return reply.send(signAuthResponse(fastify, user));
  });

  // ─── 2. Apple Sign-In ────────────────────────────────────────────────────
  fastify.post("/apple", async (request, reply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(request.body);

    // Верификация identityToken через Apple.
    // В прод: jsonwebtoken → jwt.verify(idToken, applePublicKey)
    const profile = await verifyAppleIdToken(idToken);
    if (!profile) {
      return reply.status(401).send({ error: "Invalid Apple token" });
    }

    const user = await upsertSocialUser({
      provider: SOCIAL_PROVIDER.APPLE,
      providerUserId: profile.sub,
      email: profile.email,
      username: profile.name ?? `Apple_${profile.sub.slice(-4)}`,
      avatarURL: null,
    });

    return reply.send(signAuthResponse(fastify, user));
  });

  // ─── 3. VK ID ────────────────────────────────────────────────────────────
  fastify.post("/vk", async (request, reply) => {
    const { accessToken } = z.object({ accessToken: z.string() }).parse(request.body);

    // Верификация access_token через VK API.
    // В прод: fetch(`https://api.vk.com/method/users.get?...`)
    const profile = await verifyVKAccessToken(accessToken);
    if (!profile) {
      return reply.status(401).send({ error: "Invalid VK token" });
    }

    const user = await upsertSocialUser({
      provider: SOCIAL_PROVIDER.VK,
      providerUserId: String(profile.id),
      email: profile.email,
      username: `${profile.first_name} ${profile.last_name}`,
      avatarURL: profile.photo_200,
    });

    return reply.send(signAuthResponse(fastify, user));
  });

  // ─── 4. Гостевой вход ────────────────────────────────────────────────────
  fastify.post("/guest", async (_request, reply) => {
    const guestName = `Raver_${Math.floor(1000 + Math.random() * 9000)}`;

    const user = await prisma.user.create({
      data: {
        username: guestName,
        email: `guest_${nanoid(8)}@guest.raveclone.local`,
        passwordHash: "GUEST", // гость без пароля
        avatarURL: null,
      },
    });

    // Помечаем как гостя через кастомное поле (расширить Prisma User при необходимости)
    const response = {
      ...signAuthResponse(fastify, user),
      user: { ...signAuthResponse(fastify, user).user, isGuest: true },
    };

    return reply.send(response);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers: Upsert + JWT
// ─────────────────────────────────────────────────────────────────────────────

interface SocialProfile {
  provider: string;
  providerUserId: string;
  email?: string;
  username?: string;
  avatarURL?: string | null;
}

/** Создать или обновить пользователя, привязанного к социальному провайдеру. */
async function upsertSocialUser(profile: SocialProfile) {
  const providerEmail = profile.email || `${profile.provider}_${profile.providerUserId}@social.raveclone.local`;

  // Ищем существующего по email
  const existing = await prisma.user.findUnique({ where: { email: providerEmail } });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        isOnline: true,
        lastSeenAt: new Date(),
        avatarURL: profile.avatarURL ?? existing.avatarURL,
      },
    });
  }

  // Создаём нового
  return prisma.user.create({
    data: {
      username: profile.username || `${profile.provider}_user`,
      email: providerEmail,
      passwordHash: `SOCIAL:${profile.provider}`, // метка соцвхода
      avatarURL: profile.avatarURL,
    },
  });
}

/** Сформировать единый ответ { token, user } для AuthScreen. */
function signAuthResponse(fastify: FastifyInstance, user: any) {
  const token = fastify.jwt.sign(
    { sub: user.id, username: user.username },
    { sub: user.id }
  );
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarURL: user.avatarURL,
      isGuest: user.passwordHash === "GUEST",
      isOnline: true,
      createdAt: user.createdAt,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Верификация внешних токенов (заглушки → заменить на реальную логику)
// ─────────────────────────────────────────────────────────────────────────────

async function verifyGoogleIdToken(_idToken: string): Promise<{ sub: string; email: string; name: string; picture: string } | null> {
  // ПРОД: const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  //       const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  //       return ticket.getPayload();
  return {
    sub: "google_demo_sub_123",
    email: "demo.google@gmail.com",
    name: "Google Demo User",
    picture: "https://placehold.co/200",
  };
}

async function verifyAppleIdToken(_idToken: string): Promise<{ sub: string; email: string; name?: string } | null> {
  // ПРОД: декодировать JWT, проверить подпись через Apple Root CA.
  return { sub: "apple_demo_sub_456", email: "demo.apple@privaterelay.appleid.com" };
}

async function verifyVKAccessToken(_accessToken: string): Promise<{ id: number; first_name: string; last_name: string; email?: string; photo_200?: string } | null> {
  // ПРОД: const res = await fetch(`https://api.vk.com/method/users.get?access_token=${accessToken}&fields=photo_200&v=5.199`);
  //       return (await res.json()).response[0];
  return {
    id: 123456789,
    first_name: "VK",
    last_name: "Demo",
    photo_200: "https://placehold.co/200",
  };
}
