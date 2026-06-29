import type { WebSocket } from "ws";
import type { FastifyBaseLogger } from "fastify";
import type {
  SyncMessage,
  WebRTCSignalingMessage,
  ChatPayload,
  InboundMessage,
  AuthenticatedUser,
  SyncCommand,
} from "../types/index.js";
import { prisma } from "../config/db.js";
import { redis, redisKeys } from "../config/redis.js";
import { HEARTBEAT_TIMEOUT_MS, MAX_ROOM_PARTICIPANTS } from "../config/index.js";
import { now, safeJSONParse } from "../utils/index.js";

// ─── Connection Context ──────────────────────────────

interface ClientConnection {
  ws: WebSocket;
  user: AuthenticatedUser;
  rooms: Set<string>;           // which rooms this client is subscribed to
  lastPing: number;             // timestamp of last received ping
  isAlive: boolean;
}

// ─── Room State (in-memory) ───────────────────────────

interface RoomRuntimeState {
  roomID: string;
  hostID: string;
  isPlaying: boolean;
  currentMediaTime: number;
  mediaItemID: string | null;
  participants: Map<string, ClientConnection>;
  lastActivity: number;
}

// ─── WebSocket Manager ──────────────────────────────
/**
 * Central manager for all WebSocket connections.
 *
 * Responsibilities:
 * - Authenticate incoming WS connections (JWT from query param)
 * - Manage room subscriptions (join/leave)
 * - Broadcast sync commands to room participants
 * - Relay WebRTC signaling between peers
 * - Periodic heartbeat monitoring
 * - Clean disconnect handling
 */
export class WebSocketManager {
  private connections = new Map<string, ClientConnection>();  // ws → client
  private rooms = new Map<string, RoomRuntimeState>();         // roomID → state
  private userToConnection = new Map<string, Set<string>>();  // userID → set of ws IDs

  constructor(private log: FastifyBaseLogger) {
    // Periodic heartbeat check — disconnect dead connections
    setInterval(() => this.checkHeartbeats(), HEARTBEAT_TIMEOUT_MS);
    log.info("[WS] Manager initialized");
  }

  // ─── Connection Lifecycle ────────────────────────────

  /**
   * Register a new WebSocket connection with an authenticated user.
   */
  register(ws: WebSocket, user: AuthenticatedUser): string {
    const connID = `ws_${user.id}_${Date.now()}`;
    const conn: ClientConnection = {
      ws,
      user,
      rooms: new Set(),
      lastPing: Date.now(),
      isAlive: true,
    };

    this.connections.set(connID, conn);

    // Track user → connection mapping
    if (!this.userToConnection.has(user.id)) {
      this.userToConnection.set(user.id, new Set());
    }
    this.userToConnection.get(user.id)!.add(connID);

    this.log.info({ connID, userID: user.id }, "[WS] Connected");

    return connID;
  }

  /**
   * Remove a WebSocket connection.
   */
  unregister(connID: string): void {
    const conn = this.connections.get(connID);
    if (!conn) return;

    // Leave all rooms
    for (const roomID of conn.rooms) {
      this.leaveRoom(connID, roomID, false);
    }

    // Remove from user mapping
    this.userToConnection.get(conn.user.id)?.delete(connID);
    if (this.userToConnection.get(conn.user.id)?.size === 0) {
      this.userToConnection.delete(conn.user.id);
    }

    this.connections.delete(connID);
    this.log.info({ connID, userID: conn.user.id }, "[WS] Disconnected");
  }

  // ─── Room Management ──────────────────────────────────

  /**
   * Client joins a room. Loads state from DB if needed.
   */
  async joinRoom(connID: string, roomID: string): Promise<boolean> {
    const conn = this.connections.get(connID);
    if (!conn) return false;

    // Verify membership in DB
    const membership = await prisma.membership.findUnique({
      where: { roomID_userID: { roomID, userID: conn.user.id } },
    });

    if (!membership) {
      this.sendError(conn.ws, "Not a member of this room");
      return false;
    }

    // Get or create room state
    let room = this.rooms.get(roomID);
    if (!room) {
      const roomData = await prisma.room.findUnique({ where: { id: roomID } });
      if (!roomData || !roomData.isActive) {
        this.sendError(conn.ws, "Room not found or inactive");
        return false;
      }

      room = {
        roomID,
        hostID: roomData.hostID,
        isPlaying: false,
        currentMediaTime: 0,
        mediaItemID: roomData.mediaItemID,
        participants: new Map(),
        lastActivity: Date.now(),
      };
      this.rooms.set(roomID, room);
    }

    // Check capacity
    if (room.participants.size >= MAX_ROOM_PARTICIPANTS) {
      this.sendError(conn.ws, "Room is full");
      return false;
    }

    // Add to room
    room.participants.set(connID, conn);
    conn.rooms.add(roomID);
    room.lastActivity = Date.now();

    // Persist participant in Redis
    await redis.sadd(redisKeys.roomParticipants(roomID), conn.user.id);
    await redis.expire(redisKeys.roomParticipants(roomID), 3600);

    // Send current state to the joining client
    this.send(conn.ws, {
      type: "room_state",
      roomID,
      hostID: room.hostID,
      isPlaying: room.isPlaying,
      currentMediaTime: room.currentMediaTime,
      mediaItemID: room.mediaItemID,
      participantIDs: Array.from(room.participants.values()).map((c) => c.user.id),
    });

    // Broadcast participant join to others
    this.broadcastToRoom(roomID, {
      type: "participant_joined",
      roomID,
      userID: conn.user.id,
      username: conn.user.username,
      role: conn.user.role,
      timestamp: Date.now(),
    }, connID);

    // ─── Системный бродкаст при входе АДМИНИСТРАТОРА ──────────────────────
    // Глобальный админ при подключении к комнате мгновенно оповещает всех
    // участников ярким сервисным сообщением в чат.
    if (conn.user.role === "ADMIN") {
      this.log.info({ connID, userID: conn.user.id, roomID }, "[WS] ADMIN joined room");

      // 1. Системное сообщение в чат («⚠️ Администратор присоединился»)
      this.broadcastToRoom(roomID, {
        type: "chat",
        id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        roomID,
        senderID: "system",
        senderName: "Система",
        senderRole: "admin",
        text: "⚠️ Администратор присоединился к комнате",
        timestamp: new Date().toISOString(),
        isSystem: true,
        systemType: "admin_joined",
        severity: "critical",
      });

      // 2. Системное событие (для UI: подсветка, звук, анимация)
      this.broadcastToRoom(roomID, {
        type: "admin_joined",
        roomID,
        userID: conn.user.id,
        username: conn.user.username,
        role: "admin",
        timestamp: Date.now(),
      });
    }

    this.log.info({ connID, userID: conn.user.id, roomID }, "[WS] Joined room");

    return true;
  }

  /**
   * Client leaves a room. If host leaves, deactivate room.
   */
  async leaveRoom(connID: string, roomID: string, notify = true): Promise<void> {
    const conn = this.connections.get(connID);
    const room = this.rooms.get(roomID);

    if (!conn || !room || !conn.rooms.has(roomID)) return;

    room.participants.delete(connID);
    conn.rooms.delete(roomID);

    await redis.srem(redisKeys.roomParticipants(roomID), conn.user.id);

    // Check if host left → deactivate room
    if (room.hostID === conn.user.id) {
      this.log.info({ roomID }, "[WS] Host left — deactivating room");
      await prisma.room.update({
        where: { id: roomID },
        data: { isActive: false },
      });

      // Notify all remaining participants
      this.broadcastToRoom(roomID, {
        type: "room_closed",
        roomID,
        reason: "host_left",
        timestamp: Date.now(),
      });

      // Clean up room from memory
      this.cleanupRoom(roomID);
      return;
    }

    // Notify others
    if (notify && room.participants.size > 0) {
      this.broadcastToRoom(roomID, {
        type: "participant_left",
        roomID,
        userID: conn.user.id,
        username: conn.user.username,
        timestamp: Date.now(),
      });
    }

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.cleanupRoom(roomID);
    }

    this.log.info({ connID, userID: conn.user.id, roomID }, "[WS] Left room");
  }

  private cleanupRoom(roomID: string): void {
    this.rooms.delete(roomID);
    redis.del(redisKeys.roomState(roomID));
    redis.del(redisKeys.roomParticipants(roomID));
    this.log.info({ roomID }, "[WS] Room cleaned up");
  }

  // ─── Message Routing ───────────────────────────────

  /**
   * Route an inbound message to the appropriate handler.
   */
  async handleMessage(connID: string, raw: string): Promise<void> {
    const conn = this.connections.get(connID);
    if (!conn) return;

    const msg = safeJSONParse<InboundMessage>(raw);
    if (!msg) {
      this.sendError(conn.ws, "Invalid message format");
      return;
    }

    conn.lastPing = Date.now();

    // Route by type
    if ("type" in msg) {
      switch (msg.type) {
        case "join":
          await this.joinRoom(connID, msg.roomID);
          break;

        case "leave":
          await this.leaveRoom(connID, msg.roomID);
          break;

        case "chat":
          await this.handleChat(connID, msg as ChatPayload);
          break;

        case "webrtc_offer":
        case "webrtc_answer":
        case "webrtc_ice_candidate":
        case "webrtc_leave":
          this.handleWebRTC(connID, msg as WebRTCSignalingMessage);
          break;

        case "ping":
          this.send(conn.ws, { command: "pong", timestamp: Date.now() });
          break;

        default:
          this.sendError(conn.ws, `Unknown message type: ${(msg as { type: string }).type}`);
      }
      return;
    }

    // Handle sync commands (SyncMessage format)
    if ("command" in msg) {
      this.handleSyncCommand(connID, msg as SyncMessage);
    }
  }

  // ─── Sync Command Handler ────────────────────────────
  /**
   * Core: broadcast sync commands to all room participants.
   * Only the HOST can send play/pause/seek/changeMedia.
   * Participants can send stateRequest.
   */
  private handleSyncCommand(connID: string, msg: SyncMessage): void {
    const conn = this.connections.get(connID);
    const room = this.rooms.get(msg.roomID);
    if (!conn || !room) return;

    // Verify the sender is in this room
    if (!room.participants.has(connID)) {
      this.sendError(conn.ws, "Not in this room");
      return;
    }

    switch (msg.command) {
      case "play":
      case "pause":
      case "seek":
      case "changeMedia": {
        // ONLY host can send these
        if (conn.user.id !== room.hostID) {
          this.sendError(conn.ws, "Only the host can control playback");
          return;
        }

        // Update room state
        if (msg.command === "play") {
          room.isPlaying = true;
          if (msg.mediaTime !== undefined) {
            room.currentMediaTime = msg.mediaTime;
          }
        } else if (msg.command === "pause") {
          room.isPlaying = false;
          if (msg.mediaTime !== undefined) {
            room.currentMediaTime = msg.mediaTime;
          }
        } else if (msg.command === "seek") {
          if (msg.mediaTime !== undefined) {
            room.currentMediaTime = msg.mediaTime;
          }
        } else if (msg.command === "changeMedia" && msg.mediaItem) {
          room.mediaItemID = msg.mediaItem.id;
          room.currentMediaTime = 0;
          room.isPlaying = false;

          // Persist media change in DB
          prisma.room.update({
            where: { id: msg.roomID },
            data: {
              mediaItemID: msg.mediaItem.id,
              mediaTitle: msg.mediaItem.title,
              mediaStreamURL: msg.mediaItem.streamURL,
              mediaThumbnailURL: msg.mediaItem.thumbnailURL ?? null,
              mediaType: msg.mediaItem.mediaType,
              mediaSource: msg.mediaItem.source,
              mediaDuration: msg.mediaItem.duration ?? null,
            },
          }).catch((err) => this.log.error(err));
        }

        room.lastActivity = Date.now();

        // Broadcast to ALL participants (including sender for consistency)
        this.broadcastToRoom(msg.roomID, msg);

        // Also persist to Redis for crash recovery
        redis.set(
          redisKeys.roomState(msg.roomID),
          JSON.stringify({
            roomID: room.roomID,
            hostID: room.hostID,
            isPlaying: room.isPlaying,
            currentMediaTime: room.currentMediaTime,
            mediaItemID: room.mediaItemID,
            participantIDs: Array.from(room.participants.keys()),
            lastActivity: room.lastActivity,
          }),
          "EX",
          3600
        ).catch(() => {});

        this.log.debug(
          { command: msg.command, roomID: msg.roomID, mediaTime: msg.mediaTime, senderID: conn.user.id },
          "[WS] Sync broadcast"
        );
        break;
      }

      case "stateRequest": {
        // Participant requests current state from host
        // Forward only to host
        if (conn.user.id === room.hostID) return; // Host doesn't request from self

        const hostConn = this.findHostConnection(room);
        if (hostConn) {
          this.send(hostConn.ws, msg);
        } else {
          this.sendError(conn.ws, "Host not connected");
        }
        break;
      }

      case "stateResponse":
      case "correction": {
        // These come from host, broadcast to ALL other participants
        if (conn.user.id !== room.hostID) {
          this.sendError(conn.ws, "Only host can send state responses");
          return;
        }
        // Broadcast to all EXCEPT sender (host)
        this.broadcastToRoom(msg.roomID, msg, connID);
        break;
      }

      case "ping":
      case "pong":
        break;
    }
  }

  // ─── WebRTC Signaling ───────────────────────────────
  /**
   * Relay WebRTC signaling messages between peers.
   * SDP offers, answers, and ICE candidates are forwarded
   * to the specific target peer or broadcast to all peers in room.
   */
  private handleWebRTC(connID: string, msg: WebRTCSignalingMessage): void {
    const conn = this.connections.get(connID);
    const room = this.rooms.get(msg.roomID);
    if (!conn || !room) return;

    if (!room.participants.has(connID)) {
      return;
    }

    this.log.debug(
      { type: msg.type, from: conn.user.id, roomID: msg.roomID, target: msg.targetID },
      "[WS] WebRTC signaling"
    );

    if (msg.type === "webrtc_leave") {
      // Broadcast leave to all in room
      this.broadcastToRoom(msg.roomID, msg, connID);
      return;
    }

    if (msg.targetID) {
      // Point-to-point: send to specific user
      const targetConn = this.findConnectionByUser(msg.roomID, msg.targetID);
      if (targetConn) {
        this.send(targetConn.ws, msg);
      } else {
        this.log.warn(
          { targetID: msg.targetID, roomID: msg.roomID },
          "[WS] WebRTC target not found in room"
        );
      }
    } else {
      // Broadcast to all other participants (mesh topology: everyone connects to everyone)
      this.broadcastToRoom(msg.roomID, msg, connID);
    }
  }

  // ─── Chat Handler ──────────────────────────────────
  /**
   * Relay text messages to all room participants.
   * Optionally persist to DB.
   */
  private async handleChat(connID: string, msg: ChatPayload): Promise<void> {
    const conn = this.connections.get(connID);
    const room = this.rooms.get(msg.roomID);
    if (!conn || !room) return;

    if (!room.participants.has(connID)) return;

    // Persist to DB (fire-and-forget)
    prisma.chatMessage
      .create({
        data: {
          roomID: msg.roomID,
          senderID: msg.senderID,
          text: msg.text,
        },
      })
      .catch((err) => this.log.error(err, "Failed to persist chat message"));

    // Broadcast to all in room (including sender)
    this.broadcastToRoom(msg.roomID, {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Heartbeat Monitoring ───────────────────────────
  /**
   * Check all connections for heartbeat timeout.
   * Disconnect connections that haven't sent a ping within the timeout.
   */
  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [connID, conn] of this.connections) {
      if (now - conn.lastPing > HEARTBEAT_TIMEOUT_MS) {
        this.log.warn(
          { connID, userID: conn.user.id, lastPingAgo: now - conn.lastPing },
          "[WS] Heartbeat timeout — disconnecting"
        );
        conn.ws.terminate();
        this.unregister(connID);
      }
    }
  }

  // ─── Helpers ────────────────────────────────────────

  /**
   * Broadcast a message to all participants in a room.
   * Optionally exclude a connection ID (usually the sender).
   *
   * Public — используется admin-routes для системных оповещений.
   */
  broadcastToRoom(roomID: string, data: unknown, excludeConnID?: string): void {
    const room = this.rooms.get(roomID);
    if (!room) return;

    const payload = typeof data === "string" ? data : JSON.stringify(data);

    let sentCount = 0;
    for (const [id, conn] of room.participants) {
      if (id === excludeConnID) continue;
      if (conn.ws.readyState === conn.ws.OPEN) {
        conn.ws.send(payload);
        sentCount++;
      }
    }

    if (this.log.level === "debug") {
      this.log.debug(
        { roomID, sentCount, total: room.participants.size, excluded: !!excludeConnID },
        "[WS] Broadcast"
      );
    }
  }

  /**
   * Find the host's WebSocket connection in a room.
   */
  private findHostConnection(room: RoomRuntimeState): ClientConnection | undefined {
    for (const [, conn] of room.participants) {
      if (conn.user.id === room.hostID) {
        return conn;
      }
    }
    return undefined;
  }

  /**
   * Find a specific user's connection in a room.
   */
  private findConnectionByUser(roomID: string, userID: string): ClientConnection | undefined {
    const room = this.rooms.get(roomID);
    if (!room) return undefined;
    for (const [, conn] of room.participants) {
      if (conn.user.id === userID) return conn;
    }
    return undefined;
  }

  /**
   * Send a message to a single WebSocket.
   */
  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send an error message to a client.
   */
  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }

  // ─── Admin operations (вызываются из admin-routes) ───────────────────

  /**
   * Принудительно отключить пользователя от конкретной комнаты.
   * Используется админом при кике.
   */
  kickUserFromRoom(roomID: string, userID: string): void {
    const connIDs = this.userToConnection.get(userID);
    if (!connIDs) return;

    for (const connID of connIDs) {
      const conn = this.connections.get(connID);
      if (!conn || !conn.rooms.has(roomID)) continue;

      // Уведомляем клиента о кике
      this.send(conn.ws, {
        type: "kicked",
        roomID,
        reason: "kicked_by_admin",
        timestamp: Date.now(),
      });

      // Удаляем из комнаты
      this.leaveRoom(connID, roomID, false);
    }

    this.log.info({ roomID, userID }, "[WS] User kicked from room (admin)");
  }

  /**
   * Отключить пользователя от ВСЕХ WS-соединений (глобальный бан).
   */
  disconnectUserEverywhere(userID: string, reason: string): void {
    const connIDs = this.userToConnection.get(userID);
    if (!connIDs || connIDs.size === 0) return;

    for (const connID of connIDs) {
      const conn = this.connections.get(connID);
      if (!conn) continue;

      this.send(conn.ws, {
        type: "force_disconnect",
        reason,
        timestamp: Date.now(),
      });

      conn.ws.close(1008, reason);
      this.unregister(connID);
    }

    this.log.info({ userID, reason }, "[WS] User disconnected everywhere (global ban)");
  }

  // ─── Debug / Admin ────────────────────────────────

  getStats() {
    return {
      totalConnections: this.connections.size,
      activeRooms: this.rooms.size,
      rooms: Array.from(this.rooms.entries()).map(([id, room]) => ({
        id,
        participants: room.participants.size,
        hostID: room.hostID,
        isPlaying: room.isPlaying,
      })),
    };
  }
}
