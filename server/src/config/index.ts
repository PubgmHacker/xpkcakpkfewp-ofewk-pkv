import type { FastifyBaseLogger } from "fastify";

export interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  firebaseProjectId: string;
  firebasePrivateKey: string;
  firebaseClientEmail: string;
  ytdlpPath: string;
  corsOrigin: string[];
  rateLimitMax: number;
  rateLimitWindow: number;
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function loadConfig(_log: FastifyBaseLogger): Config {
  return {
    port: parseInt(optional("PORT", "3000"), 10),
    nodeEnv: optional("NODE_ENV", "development"),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
    jwtSecret: optional("JWT_SECRET", "dev-secret-change-me"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "7d"),
    firebaseProjectId: optional("FIREBASE_PROJECT_ID", ""),
    firebasePrivateKey: optional("FIREBASE_PRIVATE_KEY", ""),
    firebaseClientEmail: optional("FIREBASE_CLIENT_EMAIL", ""),
    ytdlpPath: optional("YTDLP_PATH", "yt-dlp"),
    corsOrigin: optional("CORS_ORIGIN", "*").split(","),
    rateLimitMax: parseInt(optional("RATE_LIMIT_MAX", "100"), 10),
    rateLimitWindow: parseInt(optional("RATE_LIMIT_WINDOW", "60000"), 10),
  };
}

export const HEARTBEAT_INTERVAL_MS = 30_000;  // 30s
export const HEARTBEAT_TIMEOUT_MS = 45_000;   // 45s — if no ping in this time, disconnect
export const ROOM_STATE_TTL = 3600;             // 1h Redis TTL for inactive rooms
export const MAX_ROOM_PARTICIPANTS = 20;
