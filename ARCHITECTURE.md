# Rave Clone — Architecture Documentation

## Architecture Pattern: MVVM + Service Layer + Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Views (SwiftUI)                   │
│  HomeView, RoomView, AuthView, ProfileView, ChatView    │
├─────────────────────────────────────────────────────────┤
│                     ViewModels (@Observable)              │
│  HomeViewModel, RoomViewModel, AuthViewModel, ProfileVM │
├─────────────────────────────────────────────────────────┤
│                     Services Layer                        │
│  AuthService, RoomService, SyncService, VoiceChatService│
├─────────────────────────────────────────────────────────┤
│                   Networking Layer                        │
│  WebSocketClient, WebRTCClient, APIClient               │
├─────────────────────────────────────────────────────────┤
│                     Core / Models                        │
│  User, Room, SyncState, Message, MediaItem               │
└─────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Swift Observation Framework (iOS 17+)
Instead of Combine/ObservableObject, we use `@Observable` macro for ViewModels.
This gives us fine-grained tracking — views only re-render when properties they
actually read change.

### 2. WebSocket over Socket.io
For media sync, raw WebSocket gives us more control over message format and
guaranteed ordering. Socket.io adds overhead we don't need for our simple
command protocol.

### 3. WebRTC for Voice (not WebSockets)
Voice requires low-latency peer-to-peer audio. WebRTC handles:
- ICE candidate exchange via our WebSocket signaling server
- SRTP encryption (mandatory, E2E)
- Adaptive bitrate
- Jitter buffer and packet loss concealment
- AEC (Acoustic Echo Cancellation) when using speaker

### 4. Dependency Injection via Environment
Services are injected via SwiftUI `.environment()` modifier and accessed
with `@Environment()`. No singletons, testable architecture.

### 5. Sync Protocol
Custom lightweight protocol over WebSocket:
- `play`, `pause`, `seek` commands from host
- `state` broadcasts (position, playing status) every 2s
- Client requests sync corrections if drift > 500ms
- Host sends `correction` with exact timestamp to seek to

---

## Project Structure

```
RaveClone/
├── RaveCloneApp.swift          // @main entry point, DI setup
├── Models/
│   ├── User.swift              // User profile model
│   ├── Room.swift               // Room model with participants
│   ├── MediaItem.swift          // Content being played
│   ├── SyncState.swift          // Playback sync state
│   ├── Message.swift            // Chat message model
│   └── WebRTCConfig.swift       // WebRTC ICE server config
├── Views/
│   ├── Home/
│   │   ├── HomeView.swift       // Main tab: room list
│   │   ├── RoomCardView.swift   // Individual room cell
│   │   └── CreateRoomView.swift // Sheet to create room
│   ├── Room/
│   │   ├── RoomView.swift       // Room session view
│   │   ├── MediaControlView.swift // Transport controls
│   │   └── ParticipantListView.swift // Who's in the room
│   ├── Auth/
│   │   ├── LoginView.swift
│   │   └── SignUpView.swift
│   ├── Profile/
│   │   └── ProfileView.swift
│   ├── Chat/
│   │   └── ChatView.swift       // Text chat in room
│   └── Components/
│       ├── VoiceChatToggle.swift
│       └── SyncIndicator.swift
├── ViewModels/
│   ├── HomeViewModel.swift
│   ├── RoomViewModel.swift      // Core: sync + media + voice
│   ├── AuthViewModel.swift
│   └── ProfileViewModel.swift
├── Services/
│   ├── AuthService.swift        // Firebase Auth
│   ├── RoomService.swift        // Room CRUD + management
│   ├── SyncEngine.swift         // AVPlayer + WebSocket sync
│   ├── VoiceChatService.swift   // WebRTC voice
│   └── NotificationService.swift
├── Networking/
│   ├── WebSocketClient.swift    // Starscream-based WS
│   ├── APIClient.swift          // REST for room CRUD
│   └── SignalingClient.swift    // WebRTC signaling via WS
├── Protocols/
│   ├── SyncProtocol.swift       // Sync command definitions
│   └── ServiceProtocol.swift    // Service abstractions for DI
├── Extensions/
│   ├── Color+Theme.swift
│   └── View+Extensions.swift
├── Utilities/
│   ├── HapticManager.swift
│   └── Logger.swift
└── Resources/
    ├── Assets.xcassets
    └── Localizable.strings
```

## Data Flow: Room Sync

```
Host presses Play
       │
       ▼
RoomViewModel.play()
       │
       ├─▶ SyncEngine.play()        → AVPlayer.play()
       │
       └─▶ WebSocketClient.send(    → Server broadcasts to all
              SyncCommand.play(         other clients
                timestamp: now,
                mediaTime: player.time
              )
            )
                                         │
                              Other clients receive
                                         │
                                         ▼
                              RoomViewModel.handle(.play)
                                         │
                              SyncEngine.seek(to: mediaTime)
                              SyncEngine.play()
                              └─▶ Show "syncing..." indicator
```
