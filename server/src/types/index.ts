// ─── Shared Types ──────────────────────────────────────

// Sync commands matching the iOS client SyncCommand enum
export type SyncCommand =
  | "play"
  | "pause"
  | "seek"
  | "changeMedia"
  | "stateRequest"
  | "stateResponse"
  | "correction"
  | "ping"
  | "pong";

// WebSocket message from client
export interface SyncMessage {
  command: SyncCommand;
  roomID: string;
  senderID: string;
  mediaTime?: number;
  mediaItem?: MediaItemPayload;
  timestamp: number;
}

// Media item payload
export interface MediaItemPayload {
  id: string;
  title: string;
  artist?: string;
  thumbnailURL?: string;
  streamURL: string;
  duration?: number;
  mediaType: "movie" | "series" | "music" | "video" | "livestream";
  source: "url" | "youtube" | "vimeo" | "plex" | "jellyfin" | "local";
}

// WebRTC signaling messages
export interface WebRTCSignalingMessage {
  type: "webrtc_offer" | "webrtc_answer" | "webrtc_ice_candidate" | "webrtc_leave";
  roomID: string;
  userID: string;
  targetID?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

// Screen Share signaling — host broadcasts screen, guests subscribe
export type ScreenShareMessageType =
  | "screen_share_start"    // host announces it's streaming
  | "screen_share_stop"     // host stops streaming
  | "screen_share_subscribe" // guest wants to receive the stream
  | "screen_share_request_offer"; // guest asks host for SDP offer

export interface ScreenShareMessage {
  type: ScreenShareMessageType;
  roomID: string;
  userID: string;          // sender
  hostID?: string;         // who is streaming
  viewerCount?: number;    // how many guests are watching
  bitrate?: number;        // negotiated bitrate cap
}

// Chat message from client
export interface ChatPayload {
  type: "chat";
  roomID: string;
  senderID: string;
  senderName: string;
  text: string;
}

// Глобальные роли пользователей (соответствует Prisma enum UserRole)
export type UserRole = "USER" | "MODERATOR" | "FOUNDER" | "ADMIN";

// Authenticated user attached to WS connection
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

// Room state stored in Redis
export interface RoomState {
  roomID: string;
  hostID: string;
  isPlaying: boolean;
  currentMediaTime: number;
  mediaItemID: string | null;
  participantIDs: string[];
  lastActivity: number;
}

// Join room message
export interface JoinRoomMessage {
  type: "join";
  roomID: string;
  userID: string;
}

// Leave room message
export interface LeaveRoomMessage {
  type: "leave";
  roomID: string;
  userID: string;
}

// Union of all inbound WS message types
export type InboundMessage =
  | (SyncMessage & { command: SyncCommand })
  | WebRTCSignalingMessage
  | ScreenShareMessage
  | ChatPayload
  | JoinRoomMessage
  | LeaveRoomMessage
  | { type: "ping"; timestamp: number };
