import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { URL } from "url";
import { WebSocketManager } from "./ws-manager.js";
import type { AuthenticatedUser } from "../types/index.js";

// ─── WebSocket Plugin ──────────────────────────────────
/**
 * Registers the WebSocket server with Fastify using @fastify/websocket.
 * Handles:
 * 1. JWT authentication via query param ?token=xxx
 * 2. Delegates to WebSocketManager for all room/sync logic
 * 3. Sets up the ws:// endpoint at /ws
 */

export async function wsHandler(fastify: FastifyInstance): Promise<void> {
  const manager = new WebSocketManager(fastify.log);

  // Expose manager for access from other routes
  fastify.decorate("wsManager", manager);

  // Register @fastify/websocket
  await fastify.register(import("@fastify/websocket"), {
    // No global WebSocket config — we handle routing ourselves
  });

  // WS endpoint: /ws
  fastify.get("/ws", { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    handleConnection(socket, request, manager, fastify);
  });

  // WS endpoint with room param: /ws/room/:roomId
  fastify.get("/ws/room/:roomId", { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    handleConnection(socket, request, manager, fastify);
  });

  // Debug endpoint
  fastify.get("/ws/stats", async () => {
    return manager.getStats();
  });
}

// ─── Connection Handler ───────────────────────────────

async function handleConnection(
  ws: WebSocket,
  request: FastifyRequest,
  manager: WebSocketManager,
  fastify: FastifyInstance
): Promise<void> {
  // 1. Authenticate via JWT in query string
  const user = await authenticateWs(request, fastify);
  if (!user) {
    ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
    ws.close(1008, "Not authenticated");
    return;
  }

  // 2. Parse URL for optional auto-join room
  const url = new URL(request.url, `ws://${request.headers.host}`);
  const autoRoomID = url.searchParams.get("roomId") || url.pathname.split("/room/")[1] || null;

  // 3. Register connection
  const connID = manager.register(ws, user);

  // 4. Auto-join room if specified
  if (autoRoomID) {
    const joined = await manager.joinRoom(connID, autoRoomID);
    if (!joined) {
      // Room join failed, but connection stays open
      fastify.log.warn({ roomID: autoRoomID, userID: user.id }, "[WS] Auto-join failed");
    }
  }

  // 5. Set up message handler
  ws.on("message", (data: Buffer | string) => {
    const raw = Buffer.isBuffer(data) ? data.toString("utf-8") : data;
    manager.handleMessage(connID, raw).catch((err) => {
      fastify.log.error(err, "[WS] Message handling error");
    });
  });

  // 6. Set up close handler
  ws.on("close", (code: number, reason: Buffer) => {
    fastify.log.debug(
      { connID, code, reason: reason.toString() },
      "[WS] Connection close event"
    );
    manager.unregister(connID);
  });

  // 7. Handle errors
  ws.on("error", (err: Error) => {
    fastify.log.error({ connID, error: err.message }, "[WS] Error");
    manager.unregister(connID);
  });

  // 8. Send welcome message
  ws.send(JSON.stringify({
    type: "connected",
    connID,
    serverTime: Date.now(),
  }));
}

// ─── JWT Auth for WebSocket ──────────────────────────
/**
 * WebSocket doesn't have HTTP headers on upgrade in all clients,
 * so we accept JWT via query parameter: ?token=xxx
 */
async function authenticateWs(
  request: FastifyRequest,
  fastify: FastifyInstance
): Promise<AuthenticatedUser | null> {
  const url = new URL(request.url, `ws://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    // Fallback: try Authorization header (some WS clients send it)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = fastify.jwt.verify<{ sub: string; username: string }>(authHeader.slice(7));
        return { id: payload.sub, username: payload.username, email: "", role: "USER" };
      } catch {
        return null;
      }
    }
    return null;
  }

  try {
    const payload = fastify.jwt.verify<{ sub: string; username: string }>(token);
    return {
      id: payload.sub,
      username: payload.username,
      email: "",
      role: "USER",
    };
  } catch {
    return null;
  }
}

// ─── Fastify Decorator Type ───────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    wsManager: WebSocketManager;
  }
}
