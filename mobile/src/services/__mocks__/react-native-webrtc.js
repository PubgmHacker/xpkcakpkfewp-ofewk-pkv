// ═══════════════════════════════════════════════════════════════════════════
//  react-native-webrtc — Mock для Expo Go
//
//  react-native-webrtc — это нативный модуль (C++ + Objective-C/Java),
//  который НЕ поддерживается в Expo Go. Для запуска в Expo Go мы мокаем
//  все экспорты заглушками, чтобы приложение компилировалось и работало
//  (видео, чат, синхронизация, авторизация, DRM-overlay — всё работает).
//
//  Голосовой чат (WebRTC) включится после перехода на EAS Build:
//    npx eas-cli build --profile development --platform ios
//
//  Metro автоматически подхватывает этот файл через metro.config.js
//  (resolver.extraNodeModules).
// ═══════════════════════════════════════════════════════════════════════════

// React должен быть импортирован ДО использования в RTCView (важно!)
import React from "react";
import { View } from "react-native";

// ─── Типы (заглушки) ────────────────────────────────────────────────────────

export const RTCPeerConnectionState = {
  NEW: "new",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
  CLOSED: "closed",
};

export const RTCSdpType = {
  OFFER: "offer",
  ANSWER: "answer",
  PRANSWER: "pranswer",
};

export const RTCIceConnectionState = {
  NEW: "new",
  CHECKING: "checking",
  CONNECTED: "connected",
  COMPLETED: "completed",
  FAILED: "failed",
  DISCONNECTED: "disconnected",
  CLOSED: "closed",
};

export const RTCIceGatheringState = {
  NEW: "new",
  GATHERING: "gathering",
  COMPLETE: "complete",
};

// ─── Классы-заглушки (no-op) ────────────────────────────────────────────────

export class RTCPeerConnection {
  constructor(_config) {
    console.warn("[WebRTC Mock] RTCPeerConnection: голосовой чат недоступен в Expo Go. Используйте EAS Build.");
  }
  addTrack() {}
  removeTrack() {}
  addTransceiver() {}
  createOffer() { return Promise.resolve({ type: "offer", sdp: "" }); }
  createAnswer() { return Promise.resolve({ type: "answer", sdp: "" }); }
  setLocalDescription() { return Promise.resolve(); }
  setRemoteDescription() { return Promise.resolve(); }
  addIceCandidate() { return Promise.resolve(); }
  close() {}
  getStats() { return Promise.resolve(new Map()); }
  getSenders() { return []; }
  getReceivers() { return []; }
  getTransceivers() { return []; }
}

export class RTCSessionDescription {
  constructor({ sdp, type }) {
    this.sdp = sdp;
    this.type = type;
  }
}

export class RTCIceCandidate {
  constructor({ candidate, sdpMLineIndex, sdpMid }) {
    this.candidate = candidate;
    this.sdpMLineIndex = sdpMLineIndex;
    this.sdpMid = sdpMid;
  }
}

export class RTCMediaStream {
  constructor() {
    this.id = "mock-stream";
    this.active = false;
  }
  getTracks() { return []; }
  getAudioTracks() { return []; }
  getVideoTracks() { return []; }
  addTrack() {}
  removeTrack() {}
  release() {}
}

export class RTCRtpReceiver {
  constructor() { this.track = null; }
}

export class RTCAudioTrack {
  constructor() {
    this.id = "mock-audio";
    this.enabled = false;
    this.kind = "audio";
  }
  stop() {}
}

export class RTCVideoTrack {
  constructor() {
    this.id = "mock-video";
    this.enabled = false;
    this.kind = "video";
  }
  stop() {}
}

export class RTCConfiguration {
  constructor() {
    this.iceServers = [];
    this.iceTransportPolicy = "all";
  }
}

export class RTCIceServer {
  constructor() {
    this.urls = [];
  }
}

export class RTCMediaStreamTrack {
  constructor() {
    this.id = "mock-track";
    this.enabled = false;
    this.kind = "audio";
  }
  stop() {}
}

export class RTCView extends React.Component {
  render() {
    const { style } = this.props;
    return React.createElement(View, { style: [{ backgroundColor: "#000" }, style] });
  }
}

export class RTCDataChannel {
  constructor() {
    this.readyState = "closed";
  }
  send() {}
  close() {}
}

// ─── Функции ────────────────────────────────────────────────────────────────

export function initializeSSL() {
  console.log("[WebRTC Mock] SSL initialized (no-op in Expo Go)");
  return true;
}

export function RTCPeerConnection_deprecated() {}

export function mediaDevices_getUserMedia() {
  console.warn("[WebRTC Mock] getUserMedia недоступен в Expo Go");
  return Promise.resolve(new RTCMediaStream());
}

export function mediaDevices_getDisplayMedia() {
  return Promise.resolve(new RTCMediaStream());
}

// Импорты React и View находятся вверху файла (нужны для RTCView).

// Дефолтный экспорт (некоторые библиотеки используют import WebRTC from '...')
export default {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCMediaStream,
  RTCView,
  RTCAudioTrack,
  RTCVideoTrack,
  RTCRtpReceiver,
  RTCDataChannel,
  initializeSSL,
  mediaDevices: {
    getUserMedia: mediaDevices_getUserMedia,
    getDisplayMedia: mediaDevices_getDisplayMedia,
  },
};
