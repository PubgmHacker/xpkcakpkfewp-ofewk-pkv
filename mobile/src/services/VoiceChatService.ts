// ═══════════════════════════════════════════════════════════════════════════
//  VoiceChatService — WebRTC голосовой чат (mesh topology)
//
//  Архитектура:
//    Каждый участник создаёт peer-соединение с каждым другим участником.
//    Сигналинг (offer/answer/ICE candidates) идёт через WebSocket.
//    Сервер ретранслирует мыbrtc_* сообщения конкретному targetID.
//
//  Поток:
//    1. Вход в комнату → wsService.on("participant_joined")
//    2. Создаём RTCPeerConnection для нового участника
//    3. Формируем SDP offer → отправляем через wsService (webrtc_offer)
//    4. Получаем webrtc_answer → устанавливаем remote description
//    5. ICE candidates летят через webrtc_ice_candidate
//    6. Локальный микрофон → MediaStream → addTrack → отправка
//    7. ontrack → play remote audio (RemoteAudioView)
//
//  Использование:
//    const voiceChat = new VoiceChatService(wsService);
//    voiceChat.enable();
//    voiceChat.handlePeerJoined("user_123", "Alice");
//    voiceChat.handleSignaling({ type: "webrtc_offer", ... });
//    voiceChat.disable();
// ═══════════════════════════════════════════════════════════════════════════

import { wsService } from "./wsService";
import type { WSParticipantJoined } from "./wsService";

// ─── STUN/TURN config ────────────────────────────────────────────────────────
//
// ⚠️ P0 для продакшена: без TURN-сервера WebRTC НЕ пробьёт симметричный NAT
//    (мобильные операторы, корпоративные Wi-Fi).
//    Варианты бесплатного/дешёвого TURN:
//      1. Twilio NAT Traversal Service (есть free tier)
//         → вставьте token из вашего Twilio account ниже
//      2. Self-hosted Coturn на VPS
//         → https://github.com/coturn/coturn
//      3. Open Relay (free, open-turn):
//         → { urls:"turn:openrelay.metered.ca:80", username:"openrelayproject",
//             credential:"openrelayproject" }
//
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // ─── STUN (бесплатные, для discovery) ────────────────────────────────
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },

    // ─── TURN: Open Relay (бесплатный, для теста) ──────────────────────────
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },

    // ─── PROD TURN: замените на свои Twilio/Coturn креды ────────────────────
    // { urls: "turn:your-turn-server.com:3478", username: "YOUR_USER", credential: "YOUR_PASS" },
  ],
  iceTransportPolicy: "all",
};

// ─── Peer state ─────────────────────────────────────────────────────────────

interface PeerState {
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  userID: string;
  username: string;
}

// ─── VoiceChatService ──────────────────────────────────────────────────────

export class VoiceChatService {
  private peers = new Map<string, PeerState>();  // userID → peer state
  private localStream: MediaStream | null = null;
  private enabled = false;
  private muted = false;
  private myUserID: string;

  // Callbacks для UI
  onPeerAudio?: (userID: string, stream: MediaStream) => void;
  onPeerLeft?: (userID: string) => void;
  onError?: (error: string) => void;

  constructor(myUserID: string) {
    this.myUserID = myUserID;
  }

  // ─── Enable / Disable ─────────────────────────────────────────────────────

  async enable(): Promise<void> {
    if (this.enabled) return;

    try {
      // Запрашиваем микрофон
      this.localStream = await getLocalAudioStream();
      this.enabled = true;

      // Слушаем signaling от wsService
      this.setupSignalingListeners();

      console.log("[VoiceChat] Enabled — microphone active");
    } catch (e: any) {
      console.error("[VoiceChat] Failed to get microphone:", e.message);
      this.onError?.(`Не удалось получить доступ к микрофону: ${e.message}`);
    }
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    // Закрываем все peer connections
    for (const [userID, peer] of this.peers) {
      peer.pc.close();
    }
    this.peers.clear();

    // Останавливаем микрофон
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    // Убираем слушатели
    this.teardownSignalingListeners();

    console.log("[VoiceChat] Disabled");
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !this.muted;
      }
    }
    console.log(`[VoiceChat] ${this.muted ? "Muted" : "Unmuted"}`);
    return this.muted;
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  getRemoteStream(userID: string): MediaStream | null {
    return this.peers.get(userID)?.remoteStream ?? null;
  }

  // ─── Handle peer joined (вызывать при participant_joined из WS) ───────────

  handlePeerJoined(userID: string, username: string): void {
    if (!this.enabled || this.myUserID === userID) return;
    if (this.peers.has(userID)) return;

    // Создаём PC и отправляем offer
    this.createPeerConnection(userID, username);
  }

  // ─── Handle peer left ────────────────────────────────────────────────────

  handlePeerLeft(userID: string): void {
    const peer = this.peers.get(userID);
    if (!peer) return;

    peer.pc.close();
    this.peers.delete(userID);
    this.onPeerLeft?.(userID);

    // Уведомляем сервер
    wsService.send({
      type: "webrtc_leave",
      roomID: "", // заполнит caller
      targetID: userID,
    });

    console.log("[VoiceChat] Peer left:", userID);
  }

  // ─── Create Peer Connection ───────────────────────────────────────────────

  private createPeerConnection(userID: string, username: string): void {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    const peerState: PeerState = {
      pc,
      remoteStream: new MediaStream(),
      userID,
      username,
    };
    this.peers.set(userID, peerState);

    // ─── Добавляем локальный микрофон ──────────────────────────────────────
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // ─── Remote audio track received ───────────────────────────────────────
    pc.ontrack = (event) => {
      console.log("[VoiceChat] Remote track from:", userID, event.streams);
      const stream = event.streams[0];
      if (stream) {
        peerState.remoteStream = stream;
        this.onPeerAudio?.(userID, stream);
      }
    };

    // ─── ICE candidates → отправляем через WS ───────────────────────────────
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: "webrtc_ice_candidate",
          targetID: userID,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // ─── Connection state ───────────────────────────────────────────────────
    pc.onconnectionstatechange = () => {
      console.log(`[VoiceChat] State with ${username}:`, pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.handlePeerLeft(userID);
      }
    };

    // ─── Создаём и отправляем offer ────────────────────────────────────────
    pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (pc.localDescription) {
          wsService.send({
            type: "webrtc_offer",
            targetID: userID,
            sdp: pc.localDescription!.toJSON(),
          });
        }
      })
      .catch((e) => {
        console.error("[VoiceChat] Create offer failed:", e.message);
      });
  }

  // ─── Handle incoming signaling message ────────────────────────────────────

  handleSignaling(data: {
    type: "webrtc_offer" | "webrtc_answer" | "webrtc_ice_candidate";
    targetID: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }): void {
    if (!this.enabled) return;

    const { type, targetID } = data;

    switch (type) {
      case "webrtc_offer": {
        // Кто-то прислал нам offer — создаём PC и отвечаем answer
        if (!this.peers.has(targetID)) {
          // Создаём PC (без отправки offer)
          const pc = new RTCPeerConnection(ICE_SERVERS);
          const peerState: PeerState = {
            pc,
            remoteStream: new MediaStream(),
            userID: targetID,
            username: targetID,
          };
          this.peers.set(targetID, peerState);

          if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
              pc.addTrack(track, this.localStream);
            }
          }

          pc.ontrack = (event) => {
            const stream = event.streams[0];
            if (stream) {
              peerState.remoteStream = stream;
              this.onPeerAudio?.(targetID, stream);
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              wsService.send({
                type: "webrtc_ice_candidate",
                targetID,
                candidate: event.candidate.toJSON(),
              });
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
              this.handlePeerLeft(targetID);
            }
          };

          // Set remote offer → create answer
          if (data.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
              .then(() => pc.createAnswer())
              .then((answer) => pc.setLocalDescription(answer))
              .then(() => {
                if (pc.localDescription) {
                  wsService.send({
                    type: "webrtc_answer",
                    targetID,
                    sdp: pc.localDescription!.toJSON(),
                  });
                }
              })
              .catch((e) => console.error("[VoiceChat] Handle offer failed:", e.message));
          }
        }
        break;
      }

      case "webrtc_answer": {
        const peer = this.peers.get(targetID);
        if (peer && data.sdp) {
          peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            .catch((e) => console.error("[VoiceChat] Set answer failed:", e.message));
        }
        break;
      }

      case "webrtc_ice_candidate": {
        const peer = this.peers.get(targetID);
        if (peer && data.candidate) {
          peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
            .catch((e) => console.warn("[VoiceChat] Add ICE candidate failed:", e.message));
        }
        break;
      }
    }
  }

  // ─── Signaling listeners ───────────────────────────────────────────────────

  private unsubscribes: (() => void)[] = [];

  private setupSignalingListeners(): void {
    this.teardownSignalingListeners();

    const unsubOffer = wsService.on("webrtc_offer", (data: any) => {
      this.handleSignaling(data);
    });

    const unsubAnswer = wsService.on("webrtc_answer", (data: any) => {
      this.handleSignaling(data);
    });

    const unsubIce = wsService.on("webrtc_ice_candidate", (data: any) => {
      this.handleSignaling(data);
    });

    const unsubLeave = wsService.on("webrtc_leave", (data: any) => {
      this.handlePeerLeft(data.targetID || data.userID);
    });

    this.unsubscribes = [unsubOffer, unsubAnswer, unsubIce, unsubLeave];
  }

  private teardownSignalingListeners(): void {
    this.unsubscribes.forEach((unsub) => unsub());
    this.unsubscribes = [];
  }
}

// ─── Helper: получить локальный аудио-стрим ──────────────────────────────────

async function getLocalAudioStream(): Promise<MediaStream> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaDevices = (globalThis as any).navigator?.mediaDevices;
  if (!mediaDevices) {
    throw new Error("mediaDevices not available");
  }

  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });

  return stream;
}
