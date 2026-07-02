// ═══════════════════════════════════════════════════════════════════════════
//  wsService — WebSocket-сервис для RaveClone Mobile
//
//  Задачи:
//    • Singleton-подключение к /ws с JWT-авторизацией
//    • Авто-реконнект с exponential backoff
//    • Маршрутизация входящих сообщений по типам (sync, chat, room events)
//    • Heartbeat (ping/pong) для поддержания alive
//
//  Использование:
//    import { wsService } from "../services/wsService";
//    wsService.connect(token);
//    wsService.on("room_state", (data) => { ... });
//    wsService.joinRoom(roomID);
//    wsService.send({ command: "play", roomID, mediaTime: 5.2 });
// ═══════════════════════════════════════════════════════════════════════════

import { wsConnectURL } from "../config";
import { useAuthStore } from "../store/authStore";

// ─── Типы входящих сообщений от сервера ─────────────────────────────────

export interface WSRoomState {
  type: "room_state";
  roomID: string;
  hostID: string;
  isPlaying: boolean;
  currentMediaTime: number;
  mediaItemID: string | null;
  participantIDs: string[];
}

export interface WSParticipantJoined {
  type: "participant_joined";
  roomID: string;
  userID: string;
  username: string;
  role: string;
  timestamp: number;
}

export interface WSParticipantLeft {
  type: "participant_left";
  roomID: string;
  userID: string;
  username: string;
  timestamp: number;
}

export interface WSRoomClosed {
  type: "room_closed";
  roomID: string;
  reason: string;
  timestamp: number;
}

export interface WSChatMessage {
  type: "chat";
  id: string;
  roomID: string;
  senderID: string;
  senderName: string;
  senderRole?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
  systemType?: string;
  severity?: string;
}

export interface WSSyncCommand {
  command: "play" | "pause" | "seek" | "changeMedia" | "stateRequest" | "stateResponse" | "correction";
  roomID: string;
  senderID?: string;
  mediaTime?: number;
  mediaItem?: import("../types").MediaItem;
  timestamp?: number;
}

export interface WSKicked {
  type: "kicked";
  roomID: string;
  reason: string;
  timestamp: number;
}

export interface WSForceDisconnect {
  type: "force_disconnect";
  reason: string;
  timestamp: number;
}

export interface WSAdminJoined {
  type: "admin_joined";
  roomID: string;
  userID: string;
  username: string;
  role: string;
  timestamp: number;
}

export interface WSConnected {
  type: "connected";
  connID: string;
  serverTime: number;
}

export interface WSError {
  type: "error";
  message: string;
}

export type WSIncomingMessage =
  | WSRoomState
  | WSParticipantJoined
  | WSParticipantLeft
  | WSRoomClosed
  | WSChatMessage
  | WSSyncCommand
  | WSKicked
  | WSForceDisconnect
  | WSAdminJoined
  | WSConnected
  | WSError;

// ─── Callback types ─────────────────────────────────────────────────────

type WSHandler<T = WSIncomingMessage> = (data: T) => void;
type EventMap = Record<string, Set<WSHandler>>;

// ─── Heartbeat config ───────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ═══════════════════════════════════════════════════════════════════════════
//  WSService — singleton
// ═══════════════════════════════════════════════════════════════════════════

class WSService {
  private ws: WebSocket | null = null;
  private listeners: EventMap = {};
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentRoomID: string | null = null;
  private _isConnected = false;
  private disposed = false;

  // ─── Connect ───────────────────────────────────────────────────────────

  connect(): void {
    const token = useAuthStore.getState().token;
    if (!token) {
      console.warn("[WS] No JWT — skipping connect");
      return;
    }

    // Закрываем предыдущее подключение
    this.disconnect();

    const url = wsConnectURL(token);
    console.log("[WS] Connecting to", url);

    this.disposed = false;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[WS] Connected");
      this._isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      // Если были в комнате — переподключаемся
      if (this.currentRoomID) {
        this.joinRoom(this.currentRoomID);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WSIncomingMessage;
        this.routeMessage(data);
      } catch (e) {
        console.warn("[WS] Failed to parse message", e);
      }
    };

    this.ws.onclose = (event) => {
      console.log("[WS] Closed:", event.code, event.reason);
      this._isConnected = false;
      this.stopHeartbeat();
      this.emit("_connection_state", "disconnected");

      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WS] Error", error);
      this._isConnected = false;
    };
  }

  // ─── Disconnect ─────────────────────────────────────────────────────────

  disconnect(): void {
    this.disposed = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this._isConnected = false;
    this.currentRoomID = null;
    this.emit("_connection_state", "disconnected");
  }

  // ─── Is connected ──────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ─── Join / Leave room ─────────────────────────────────────────────────

  joinRoom(roomID: string): void {
    this.currentRoomID = roomID;
    this.send({ type: "join", roomID });
  }

  leaveRoom(roomID: string): void {
    this.send({ type: "leave", roomID });
    if (this.currentRoomID === roomID) {
      this.currentRoomID = null;
    }
  }

  // ─── Send sync commands (play/pause/seek/changeMedia) ──────────────────

  sendSyncCommand(cmd: WSSyncCommand): void {
    this.send(cmd);
  }

  // ─── Send chat message ─────────────────────────────────────────────────

  sendChat(roomID: string, senderID: string, text: string): void {
    this.send({
      type: "chat",
      roomID,
      senderID,
      text,
    });
  }

  // ─── Raw send ─────────────────────────────────────────────────────────

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("[WS] Cannot send — not connected");
    }
  }

  // ─── Event listeners ────────────────────────────────────────────────────

  on(event: string, handler: WSHandler): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(handler);

    // Возвращаем функцию отписки
    return () => {
      this.listeners[event]?.delete(handler);
    };
  }

  off(event: string, handler: WSHandler): void {
    this.listeners[event]?.delete(handler);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Reconnect ──────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[WS] Max reconnect attempts reached");
      this.emit("_connection_state", "failed");
      return;
    }

    this.clearReconnectTimer();

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit("_connection_state", "reconnecting");

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Message routing ───────────────────────────────────────────────────

  private routeMessage(data: WSIncomingMessage): void {
    // Роутим по type (для sync-команд — по command)
    if ("type" in data) {
      this.emit(data.type, data);
    } else if ("command" in data) {
      this.emit(data.command, data);
    }

    // Глобальный слушатель "message" для универсального подписывания
    this.emit("message", data);
  }

  // ─── Emit ─────────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners[event];
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data as never);
      } catch (e) {
        console.error(`[WS] Handler error for "${event}"`, e);
      }
    }
  }
}

// ─── Singleton-экспорт ───────────────────────────────────────────────────

export const wsService = new WSService();
