// ═══════════════════════════════════════════════════════════════════════════
//  ScreenShareService — демонстрация экрана через WebRTC
//
//  Архитектура:
//    Хост стримит свой экран → гости получают video track через mesh.
//    iOS: используется Broadcast ReplayKit (через react-native-webrtc mediaDevices.getDisplayMedia).
//
//  Поток:
//    1. Хост вызывает startShare() → getDisplayMedia → локальный видео-стрим
//    2. Отправляет screen_share_start через WS
//    3. Гости получают screen_share_start → screen_share_subscribe
//    4. WebRTC offer/answer через существующий сигналинг
//    5. Гости получают remote video track → RTCView
//    6. Хост вызывает stopShare() → screen_share_stop
//
//  ⚠️ iOS: getDisplayMedia требует ReplayKit (системный prompt при первом запуске).
//     Android: Requires MediaProjection API.
// ═══════════════════════════════════════════════════════════════════════════

import { wsService } from "./wsService";

// ─── TURN/STUN config ────────────────────────────────────────────────────────

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // ─── Бесплатные STUN ─────────────────────────────────────────────────
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // ─── TURN (P0: заменить на реальные креды Twilio/Coturn) ──────────────
    // Без TURN не пробьют симметричный NAT. Вставьте свои:
    // { urls: "turn:turn.yourserver.com:3478", username: "user", credential: "pass" },
  ],
};

// ─── ScreenShare Service ──────────────────────────────────────────────────

export class ScreenShareService {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();  // userID → PC
  private remoteStreams = new Map<string, MediaStream>();          // userID → remote
  private sharing = false;
  private roomID: string;
  private myUserID: string;

  // Callbacks для UI
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (userID: string, stream: MediaStream) => void;
  onShareStarted?: () => void;
  onShareStopped?: () => void;
  onError?: (error: string) => void;

  constructor(roomID: string, myUserID: string) {
    this.roomID = roomID;
    this.myUserID = myUserID;
  }

  // ─── Start screen share (HOST) ────────────────────────────────────────────

  async startShare(): Promise<void> {
    if (this.sharing) return;

    try {
      // react-native-webrtc mediaDevices.getDisplayMedia
      const mediaDevices = (globalThis as any).navigator?.mediaDevices;
      if (!mediaDevices?.getDisplayMedia) {
        throw new Error("getDisplayMedia недоступен. Нужен нативный билд (не Expo Go).");
      }

      // Запрашиваем демонстрацию экрана
      this.localStream = await mediaDevices.getDisplayMedia({
        video: true,
        audio: false,  // системное аудио опционально
      });

      this.sharing = true;

      // Уведомляем сервер что начали стрим
      wsService.send({
        type: "screen_share_start",
        roomID: this.roomID,
      });

      this.onLocalStream?.(this.localStream);
      this.onShareStarted?.();

      console.log("[ScreenShare] Started by host:", this.myUserID);
    } catch (e: any) {
      console.error("[ScreenShare] Failed to start:", e.message);
      this.onError?.(`Не удалось начать демонстрацию: ${e.message}`);
    }
  }

  // ─── Stop screen share (HOST) ─────────────────────────────────────────────

  stopShare(): void {
    if (!this.sharing) return;

    // Останавливаем треки
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    // Закрываем все peer connections
    for (const [, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();

    // Уведомляем сервер
    wsService.send({
      type: "screen_share_stop",
      roomID: this.roomID,
    });

    this.sharing = false;
    this.onShareStopped?.();

    console.log("[ScreenShare] Stopped");
  }

  // ─── Subscribe to host's screen (GUEST) ────────────────────────────────────

  subscribe(hostID: string): void {
    // Просим хост прислать нам offer
    wsService.send({
      type: "screen_share_subscribe",
      roomID: this.roomID,
      hostID,
    });

    console.log("[ScreenShare] Subscribed to host:", hostID);
  }

  // ─── Handle incoming signaling ─────────────────────────────────────────────

  handleSignaling(data: {
    type: string;
    roomID: string;
    userID?: string;
    targetID?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }): void {
    const { type } = data;

    switch (type) {
      case "screen_share_start": {
        // Хост начал стрим → подписываемся
        this.subscribe(data.userID || data.targetID || "");
        break;
      }

      case "screen_share_stop": {
        // Хост остановил стрим
        this.remoteStreams.clear();
        this.onShareStopped?.();
        break;
      }

      case "webrtc_offer": {
        // Хост прислал offer (если мы гость)
        if (data.sdp && data.targetID === this.myUserID) {
          this.handleOffer(data.userID || "", data.sdp);
        }
        break;
      }

      case "webrtc_answer": {
        // Гость прислал answer (если мы хост)
        const pc = this.peerConnections.get(data.userID || "");
        if (pc && data.sdp) {
          pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            .catch((e) => console.error("[ScreenShare] Set answer:", e.message));
        }
        break;
      }

      case "webrtc_ice_candidate": {
        const pc = this.peerConnections.get(data.userID || "");
        if (pc && data.candidate) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate))
            .catch((e) => console.warn("[ScreenShare] ICE:", e.message));
        }
        break;
      }
    }
  }

  // ─── Handle offer (GUEST) ─────────────────────────────────────────────────

  private async handleOffer(hostID: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(hostID, pc);

    const remoteStream = new MediaStream();
    this.remoteStreams.set(hostID, remoteStream);

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.remoteStreams.set(hostID, stream);
        this.onRemoteStream?.(hostID, stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: "webrtc_ice_candidate",
          targetID: hostID,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsService.send({
        type: "webrtc_answer",
        targetID: hostID,
        sdp: pc.localDescription!.toJSON(),
      });
    } catch (e: any) {
      console.error("[ScreenShare] Handle offer:", e.message);
    }
  }

  // ─── Create offer to a subscriber (HOST) ──────────────────────────────────

  async createOfferToSubscriber(guestUserID: string): Promise<void> {
    if (!this.localStream) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(guestUserID, pc);

    // Добавляем локальный видео-трек (экран)
    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: "webrtc_ice_candidate",
          targetID: guestUserID,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    try {
      const offer = await pc.createOffer({ offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      wsService.send({
        type: "webrtc_offer",
        targetID: guestUserID,
        sdp: pc.localDescription!.toJSON(),
      });
    } catch (e: any) {
      console.error("[ScreenShare] Create offer:", e.message);
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.stopShare();
    this.peerConnections.clear();
    this.remoteStreams.clear();
  }

  get isSharing(): boolean {
    return this.sharing;
  }
}
