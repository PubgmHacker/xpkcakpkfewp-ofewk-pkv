import { nanoid } from "nanoid";

/**
 * Generate a 6-character room code (uppercase alphanumeric, no ambiguous chars)
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // removed I, O, 0, 1
  const id = nanoid(6);
  return id
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0) % chars.length;
      return chars[code];
    })
    .join("");
}

/**
 * Safe JSON parse — returns null instead of throwing
 */
export function safeJSONParse<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Get current unix timestamp in seconds
 */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
