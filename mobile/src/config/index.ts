// ═══════════════════════════════════════════════════════════════════════════
//  RaveClone — Конфигурация окружения (ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ)
//
//  Все экраны импортируют API_URL и WS_URL отсюда.
//  Никаких дублирующихся BACKEND_URL в отдельных файлах!
//
//  Переключение окружения:
//    __DEV__ = true  (симулятор, Expo Go)  → localhost
//    __DEV__ = false (EAS Build, прод)      → Railway URL
//
//  ⚠️ Перед сборкой .ipa через EAS замените PROD_URL на ваш реальный
//     Railway-адрес (появится после деплоя бэкенда).
// ═══════════════════════════════════════════════════════════════════════════

// ─── ПРОДАКШЕН URL (замените после деплоя на Railway) ───────────────────────
// Формат: https://ваш-проект.up.railway.app
const PROD_URL = "https://xpkcakpkfewp-ofewk-pkv-production.up.railway.app";

// ─── ЛОКАЛЬНЫЙ URL (для симулятора) ─────────────────────────────────────────
const DEV_URL = "http://localhost:3000";

// ─── Автоматический выбор окружения ─────────────────────────────────────────
const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

// ─── Экспортируемые URL ─────────────────────────────────────────────────────

/** REST API: авторизация, комнаты, экстракция медиа. */
export const API_URL = `${BASE_URL}/api`;

/** WebSocket: синхронизация воспроизведения, чат, сигналинг. */
export const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";

/** Базовый URL (для fetch-запросов с путями вида /api/...). */
export const BACKEND_URL = BASE_URL;

// ─── Полные URLs для удобства ───────────────────────────────────────────────

export const ENDPOINTS = {
  // Auth
  authGoogle: `${API_URL}/auth/google`,
  authApple: `${API_URL}/auth/apple`,
  authVK: `${API_URL}/auth/vk`,
  authGuest: `${API_URL}/auth/guest`,
  authSignup: `${API_URL}/auth/signup`,
  authSignin: `${API_URL}/auth/signin`,

  // Rooms
  rooms: `${API_URL}/rooms`,
  roomsJoin: `${API_URL}/rooms/join`,

  // Media
  mediaExtract: `${API_URL}/media/extract`,
  mediaSources: `${API_URL}/media/sources`,
  mediaProbe: `${API_URL}/media/probe`,
  mediaSearch: `${API_URL}/media/search`,
} as const;

/** Сформировать WebSocket URL для конкретной комнаты. */
export function roomWebSocketURL(roomID: string, token: string): string {
  return `${WS_URL}/room/${roomID}?token=${encodeURIComponent(token)}`;
}

/** Общий WebSocket URL (без комнаты). */
export function wsConnectURL(token: string): string {
  return `${WS_URL}?token=${encodeURIComponent(token)}`;
}
