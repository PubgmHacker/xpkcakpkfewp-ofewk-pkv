// ─────────────────────────────────────────────────────────────────────────────
//  Общие типы RaveClone Mobile
// ─────────────────────────────────────────────────────────────────────────────

import type { UserRole } from "./roles";
export type { UserRole } from "./roles";

export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string | null;
  isGuest: boolean;
  role: UserRole;
}

export interface UserPreview {
  id: string;
  username: string;
  avatar?: string | null;
  isOnline: boolean;
  role: UserRole;
}

export type MediaSourceType =
  | "youtube" | "vk" | "rutube" | "web"        // Бесплатные → нативный плеер
  | "netflix" | "disney" | "kinopoisk" | "okko" | "wink"; // DRM → WebView sync

export type PlaybackMode = "native" | "webview";

export interface MediaItem {
  sourceID: MediaSourceType;
  sourceName: string;
  mode: PlaybackMode;
  streamURL: string;
  webviewBaseURL?: string;
  title: string;
  thumbnailURL?: string;
  duration?: number;
  requiresSubscription: boolean;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  hostID: string;
  hostName: string;
  participants: UserPreview[];
  mediaItem: MediaItem | null;
  isActive: boolean;
  maxParticipants: number;
  createdAt: string;
}

// ─── Sync (соответствует бэкенду SyncCommand) ───────────────────────────────

export type SyncCommand =
  | "play" | "pause" | "seek" | "changeMedia"
  | "stateRequest" | "stateResponse" | "correction";

export interface SyncMessage {
  command: SyncCommand;
  roomID: string;
  senderID: string;
  mediaTime?: number;
  mediaItem?: MediaItem;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  roomID: string;
  senderID: string;
  senderName: string;
  senderRole?: UserRole;
  text: string;
  timestamp: string;
  /** Системное сообщение (вход админа, предупреждения, kick). */
  isSystem?: boolean;
  /** Тип системного сообщения (для стилизации). */
  systemType?: "admin_joined" | "warning" | "kick" | "ban" | "info";
  /** Подсветка важности (красный фон для admin_joined). */
  severity?: "default" | "warning" | "critical";
}
