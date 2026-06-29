# SyncWatch Server — Quick Start

## Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- yt-dlp (`brew install yt-dlp` or `pip install yt-dlp`)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in values
cp .env.example .env

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate dev

# 5. (Optional) Seed database
npx prisma db seed

# 6. Start dev server
npm run dev
```

## Architecture

```
Client (iOS) ──▶ REST API (Fastify) ──▶ PostgreSQL (Prisma)
     │                                         │
     │  ──▶ WebSocket (ws) ──▶ WebSocketManager
     │         │                    │
     │         │              Broadcast to room
     │         │                    │
     │         └──▶ Other Clients ◀─┘
     │
     └──▶ YouTube Extractor (yt-dlp)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/auth/signup | Register |
| POST | /api/auth/signin | Login |
| GET | /api/auth/me | Current user |
| POST | /api/auth/fcm-token | Register push token |
| GET | /api/rooms | List active rooms |
| GET | /api/rooms/:id | Get room |
| POST | /api/rooms | Create room |
| POST | /api/rooms/join | Join by code |
| POST | /api/rooms/:id/leave | Leave room |
| DELETE | /api/rooms/:id | Delete room (host only) |
| POST | /api/rooms/:id/report | Report room |
| POST | /api/media/extract | Extract YouTube URL |
| GET | /ws | WebSocket endpoint |
| GET | /ws/stats | WS connection stats |

## WebSocket Protocol

### Connect
```
ws://host:3000/ws?token=<JWT>&roomId=<optional>
```

### Messages (Client → Server)

```jsonc
// Join room
{ "type": "join", "roomID": "room_xxx", "userID": "user_xxx" }

// Leave room
{ "type": "leave", "roomID": "room_xxx", "userID": "user_xxx" }

// Sync commands (HOST only)
{ "command": "play", "roomID": "room_xxx", "senderID": "user_xxx", "mediaTime": 42.5, "timestamp": 1719000000 }
{ "command": "pause", "roomID": "room_xxx", "senderID": "user_xxx", "mediaTime": 42.5, "timestamp": 1719000000 }
{ "command": "seek", "roomID": "room_xxx", "senderID": "user_xxx", "mediaTime": 120, "timestamp": 1719000000 }
{ "command": "changeMedia", "roomID": "room_xxx", "senderID": "user_xxx", "mediaItem": {...}, "timestamp": 1719000000 }

// State request (participant → host)
{ "command": "stateRequest", "roomID": "room_xxx", "senderID": "user_xxx", "timestamp": 1719000000 }

// WebRTC signaling
{ "type": "webrtc_offer", "roomID": "room_xxx", "userID": "user_xxx", "targetID": "user_yyy", "sdp": "..." }
{ "type": "webrtc_answer", "roomID": "room_xxx", "userID": "user_xxx", "targetID": "user_yyy", "sdp": "..." }
{ "type": "webrtc_ice_candidate", "roomID": "room_xxx", "userID": "user_xxx", "targetID": "user_yyy", "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 }

// Chat
{ "type": "chat", "roomID": "room_xxx", "senderID": "user_xxx", "senderName": "Alex", "text": "Hello!" }

// Heartbeat
{ "type": "ping", "timestamp": 1719000000 }
```

## Deploy

```bash
# Docker Compose (production)
JWT_SECRET=<your-secret> docker compose up -d

# Railway
railway init
railway up

# Manual
docker build -t raveclone-server .
docker run -p 3000:3000 --env-file .env raveclone-server
```
