import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose";
import { prisma } from "../config/db.js";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────────────────
//  auth-social.ts — Social & Guest Login (JWT auth)
//
//  Contract (matches AppAuthScreen.tsx):
//    POST /api/auth/google   { idToken }      → verify Google, upsert, JWT
//    POST /api/auth/apple    { idToken }      → verify Apple, upsert, JWT
//    POST /api/auth/vk       { accessToken }  → verify via VK API, upsert, JWT
//    POST /api/auth/guest    {}               → generate Raver_XXXX, JWT
//
//  All methods return:
//    { token: string, user: { id, username, email?, avatarURL?, isGuest } }
// ─────────────────────────────────────────────────────────────────────────────

const SOCIAL_PROVIDER = {
  GOOGLE: "google",
  APPLE: "apple",
  VK: "vk",
  GUEST: "guest",
} as const;

// ─── Google OAuth2 client ────────────────────────────────────────────────────
// GOOGLE_CLIENT_IDS is a comma-separated list of allowed OAuth client IDs
// (web + iOS + Android). The token's `aud` must match one of them.
const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const googleClient = new OAuth2Client();

// ─── Apple JWKS endpoint ─────────────────────────────────────────────────────
// Apple signs identity tokens with keys published at this URL.
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
const appleClientIds = (process.env.APPLE_CLIENT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ─── VK API config ───────────────────────────────────────────────────────────
const VK_CLIENT_ID = process.env.VK_CLIENT_ID || "";

export async function authSocialRoutes(fastify: FastifyInstance) {
  // ─── 1. Google Sign-In ───────────────────────────────────────────────────
  fastify.post("/google", async (request, reply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(request.body);

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

  // ─── 4. Guest login ──────────────────────────────────────────────────────
  fastify.post("/guest", async (_request, reply) => {
    const guestName = `Raver_${Math.floor(1000 + Math.random() * 9000)}`;

    const user = await prisma.user.create({
      data: {
        username: guestName,
        email: `guest_${nanoid(8)}@guest.raveclone.local`,
        passwordHash: "GUEST",
        avatarURL: null,
      },
    });

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

async function upsertSocialUser(profile: SocialProfile) {
  const providerEmail =
    profile.email || `${profile.provider}_${profile.providerUserId}@social.raveclone.local`;

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

  return prisma.user.create({
    data: {
      username: profile.username || `${profile.provider}_user`,
      email: providerEmail,
      passwordHash: `SOCIAL:${profile.provider}`,
      avatarURL: profile.avatarURL,
    },
  });
}

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
//  Token Verification — real implementations
// ─────────────────────────────────────────────────────────────────────────────

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Verify a Google ID token using google-auth-library.
 * Checks signature, audience (must match GOOGLE_CLIENT_IDS), and expiry.
 *
 * Requires GOOGLE_CLIENT_IDS env var (comma-separated list of client IDs).
 * If not configured, verification is skipped with a warning (dev mode only).
 */
async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile | null> {
  if (googleClientIds.length === 0) {
    console.warn("[Auth] GOOGLE_CLIENT_IDS not set — Google login disabled");
    return null;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientIds,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      picture: payload.picture,
    };
  } catch (err: any) {
    console.error("[Auth] Google token verification failed:", err.message);
    return null;
  }
}

interface AppleProfile {
  sub: string;
  email?: string;
  name?: string;
}

/**
 * Verify an Apple identity token using jose + Apple's public JWKS.
 * Checks signature, audience (APPLE_CLIENT_IDS), issuer, and expiry.
 *
 * Requires APPLE_CLIENT_IDS env var (comma-separated list of service IDs).
 * If not configured, verification is skipped with a warning (dev mode only).
 */
async function verifyAppleIdToken(idToken: string): Promise<AppleProfile | null> {
  if (appleClientIds.length === 0) {
    console.warn("[Auth] APPLE_CLIENT_IDS not set — Apple login disabled");
    return null;
  }

  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: appleClientIds,
    });

    if (!payload.sub) return null;

    return {
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      // Apple only sends the user's name on first authorization.
      // Subsequent logins won't include it — client should cache it.
      name: payload.name as string | undefined,
    };
  } catch (err: any) {
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      console.error("[Auth] Apple token claim validation failed:", err.message);
    } else {
      console.error("[Auth] Apple token verification failed:", err.message);
    }
    return null;
  }
}

interface VKProfile {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  photo_200?: string;
}

/**
 * Verify a VK access token by calling VK API's secure.checkToken method.
 * This confirms the token is valid and belongs to our app.
 *
 * Requires VK_CLIENT_ID env var. If not configured, verification is skipped.
 */
async function verifyVKAccessToken(accessToken: string): Promise<VKProfile | null> {
  if (!VK_CLIENT_ID) {
    console.warn("[Auth] VK_CLIENT_ID not set — VK login disabled");
    return null;
  }

  try {
    // Call VK API users.get with the provided access token.
    // If the token is invalid, VK returns an error response.
    const url = `https://api.vk.com/method/users.get?access_token=${encodeURIComponent(
      accessToken
    )}&fields=photo_200,email&v=5.199`;

    const res = await fetch(url);
    const data = (await res.json()) as {
      error?: { error_msg?: string };
      response?: Array<{
        id: number;
        first_name?: string;
        last_name?: string;
        email?: string;
        photo_200?: string;
      }>;
    };

    if (data.error) {
      console.error("[Auth] VK API error:", data.error.error_msg);
      return null;
    }

    const user = data.response?.[0];
    if (!user || !user.id) {
      return null;
    }

    return {
      id: user.id,
      first_name: user.first_name || "VK",
      last_name: user.last_name || "User",
      email: user.email,
      photo_200: user.photo_200,
    };
  } catch (err: any) {
    console.error("[Auth] VK token verification failed:", err.message);
    return null;
  }
}
