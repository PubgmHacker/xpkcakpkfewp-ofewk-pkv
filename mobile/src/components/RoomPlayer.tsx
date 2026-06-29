import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";

import { DrmSessionManager, DRM_SERVICES } from "../services/DrmSessionManager";
import type { DrmServiceID } from "../services/DrmSessionManager";
import DrmOverlay from "./DrmOverlay";
import type { MediaItem, SyncMessage } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
//  RoomPlayer — гибридный плеер комнаты
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  Режим NATIVE (expo-av Video)                                        │
//  │  • YouTube, VK Видео, RuTube, прямые .mp4/.m3u8                      │
//  │  • SyncEngine управляет play/pause/seek напрямую через Video ref     │
//  ├─────────────────────────────────────────────────────────────────────┤
//  │  Режим WEBVIEW (react-native-webview)                                │
//  │  • Netflix, Disney+, Кинопоиск, Окко, Wink (DRM-контент)             │
//  │  • JS-инъекция читает currentTime плеера сервиса                     │
//  │  • SyncEngine передаёт seek-команды через injectedJavaScript         │
//  │  • Каждый зритель под своим аккаунтом (DrmOverlay проверяет)         │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  Синхронизация WebView:
//    Host: injectedJS каждые 1с читает video.currentTime → WebSocket → друзьям
//    Guest: SyncEngine принимает seek-команду → инъекция video.currentTime = X
// ─────────────────────────────────────────────────────────────────────────────

interface RoomPlayerProps {
  media: MediaItem;
  isHost: boolean;
  /** Текущая позиция (от SyncEngine, секунды). */
  currentPosition: number;
  /** Признак воспроизведения (от SyncEngine). */
  isPlaying: boolean;
  /** Колбэк при локальном изменении позиции (Host меняет — notify SyncEngine). */
  onPositionChange: (position: number) => void;
  /** Колбэк при play/pause (Host). */
  onPlayPause: (playing: boolean) => void;
  /** ID комнаты для передачи sync через WebSocket. */
  roomID: string;
}

export default function RoomPlayer(props: RoomPlayerProps) {
  const { media } = props;

  // ─── Маршрутизация по режиму ─────────────────────────────────────────────
  if (media.mode === "webview" && media.requiresSubscription) {
    return <WebViewPlayer {...props} />;
  }
  return <NativePlayer {...props} />;
}

// ═════════════════════════════════════════════════════════════════════════════
//  NATIVE PLAYER — expo-av для бесплатных источников
// ═════════════════════════════════════════════════════════════════════════════

function NativePlayer({
  media, isHost, currentPosition, isPlaying,
  onPositionChange, onPlayPause,
}: RoomPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Локальный флаг, чтобы не зацикливаться при sync-seek
  const isApplyingRemoteUpdate = useRef(false);

  // ─── Реагируем на удалённые sync-команды (от SyncEngine) ────────────────
  useEffect(() => {
    if (isApplyingRemoteUpdate.current) return;
    if (!isHost) {
      // Guest: подстраиваемся под позицию host
      applyPosition(currentPosition, isPlaying);
    }
  }, [currentPosition, isPlaying]);

  const applyPosition = async (pos: number, playing: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    isApplyingRemoteUpdate.current = true;
    try {
      await video.setPositionAsync(pos * 1000);
      if (playing) await video.playAsync();
      else await video.pauseAsync();
    } finally {
      setTimeout(() => { isApplyingRemoteUpdate.current = false; }, 300);
    }
  };

  // ─── Локальные контролы (только Host инициирует sync) ───────────────────
  const handlePlayPause = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      await video.pauseAsync();
      onPlayPause(false);
    } else {
      await video.playAsync();
      onPlayPause(true);
    }
  };

  const handleSeek = async (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const status = await video.getStatusAsync();
    if ("positionMillis" in status) {
      const newPos = Math.max(0, status.positionMillis / 1000 + delta);
      await video.setPositionAsync(newPos * 1000);
      onPositionChange(newPos);
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded || !isHost) return;
    if (isApplyingRemoteUpdate.current) return;
    // Host: сообщаем свою позицию SyncEngine-у (для broadcast)
    onPositionChange(status.positionMillis / 1000);
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.playerContainer}>
      <Video
        ref={videoRef}
        source={{ uri: media.streamURL }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={isHost}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={(e) => setError(`Не удалось загрузить: ${e}`)}
        shouldPlay={isPlaying}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#7346EB" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      )}

      {/* Контролы для guest (host юзает useNativeControls) */}
      {!isHost && !loading && (
        <View style={styles.guestControls}>
          <Text style={styles.syncBadge}>📡 Синхронизация</Text>
        </View>
      )}

      {/* Кнопки перемотки (только host) */}
      {isHost && !loading && (
        <View style={styles.seekControls}>
          <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeek(-10)}>
            <Text style={styles.seekBtnText}>⏪ 10s</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeek(10)}>
            <Text style={styles.seekBtnText}>10s ⏩</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  WEBVIEW PLAYER — DRM-сервисы (Кинопоиск, Netflix, Disney+, Окко, Wink)
// ═════════════════════════════════════════════════════════════════════════════

function WebViewPlayer({
  media, isHost, currentPosition, isPlaying,
  onPositionChange, onPlayPause,
}: RoomPlayerProps) {
  // Определяем сервис по URL
  const serviceID = detectServiceID(media.streamURL, media.sourceID);
  const drmAuthenticated = DrmSessionManager.isAuthenticated(serviceID);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  // ─── Если не залогинен в DRM-сервисе → показываем overlay ───────────────
  if (!drmAuthenticated && !overlayDismissed) {
    return (
      <DrmOverlay
        serviceID={serviceID}
        onAuthenticated={() => {
          // Перезагрузим компонент → WebView откроется с куками
          setOverlayDismissed(false);
        }}
        onDismiss={() => setOverlayDismissed(true)}
      />
    );
  }

  if (overlayDismissed && !drmAuthenticated) {
    // Пользователь отказался входить → показываем заглушку
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorText}>
          Для просмотра необходим аккаунт {DRM_SERVICES[serviceID].name}
        </Text>
      </View>
    );
  }

  // ─── Залогинен → запускаем WebView с JS-инъекцией синхронизации ─────────
  const targetURL = media.streamURL; // конкретный фильм/сериал
  const syncScript = buildWebViewSyncScript(serviceID, isHost, currentPosition, isPlaying);

  return (
    <View style={styles.playerContainer}>
      <WebView
        source={{ uri: targetURL }}
        style={styles.video}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Инъекция: Host читает currentTime, Guest применяет seek
        injectedJavaScriptBeforeContentLoaded={syncScript.initScript}
        injectedJavaScript={syncScript.periodicScript}
        onMessage={(e) => handleWebViewMessage(e, isHost, onPositionChange, onPlayPause)}
        onLoadStart={() => console.log("[WebViewPlayer] loading", targetURL)}
      />

      {/* Индикатор синхронизации */}
      <View style={styles.webviewBadge}>
        <Text style={styles.webviewBadgeText}>
          {DRM_SERVICES[serviceID].icon} {DRM_SERVICES[serviceID].name}
          {"  ·  "}
          {isHost ? "👑 Вы ведущий" : "📡 В синхроне"}
        </Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  WebView JS-инъекции — синхронизация через чтение/запись currentTime
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Сборка JS-скриптов для WebView.
 *
 * Host-режим:
 *   Каждые 1с находит <video> элемент, читает currentTime + paused,
 *   отправляет в RN через postMessage.
 *
 * Guest-режим:
 *   Слушает команды от RN (через injectedJavaScript при обновлении currentPosition),
 *   находит <video> и устанавливает currentTime.
 */
function buildWebViewSyncScript(
  serviceID: DrmServiceID,
  isHost: boolean,
  currentPosition: number,
  isPlaying: boolean
): { initScript: string; periodicScript: string } {
  // Селекторы <video> для каждого сервиса (большинство используют стандартный <video>)
  const videoSelector = "video";

  const initScript = `
    (function() {
      window.__raveCloneSync = {
        isHost: ${isHost},
        service: "${serviceID}",
        lastSeekTime: 0,
      };

      // Ожидаем появления <video> элемента
      function findVideo() {
        return document.querySelector('${videoSelector}');
      }

      ${isHost ? `
      // ─── HOST: читаем currentTime каждые 1с ──────────────────────────
      window.__raveHostInterval = setInterval(function() {
        var v = findVideo();
        if (!v) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'sync_state',
            currentTime: v.currentTime,
            duration: v.duration || 0,
            paused: v.paused,
            readyState: v.readyState,
          }));
        } catch(e) {}
      }, 1000);
      ` : `
      // ─── GUEST: готов к применению seek-команд ────────────────────────
      window.__raveApplySeek = function(targetTime, shouldPlay) {
        var v = findVideo();
        if (!v) return;
        var diff = Math.abs(v.currentTime - targetTime);
        if (diff > 1.5) {
          v.currentTime = targetTime;
        }
        if (shouldPlay && v.paused) {
          v.play().catch(function(){});
        } else if (!shouldPlay && !v.paused) {
          v.pause();
        }
      };
      `}

      console.log('[RaveClone] Sync script initialized — ' + (${isHost} ? 'HOST' : 'GUEST'));
    })();
    true;
  `;

  // Периодическая инъекция (для Guest: применяем текущую target-позицию)
  let periodicScript = "true;";
  if (!isHost) {
    periodicScript = `
      (function() {
        if (window.__raveCloneSync && window.__raveApplySeek) {
          window.__raveApplySeek(${currentPosition}, ${isPlaying});
        }
      })();
      true;
    `;
  }

  return { initScript, periodicScript };
}

/** Обработка сообщений от WebView в RN. */
function handleWebViewMessage(
  event: WebViewMessageEvent,
  isHost: boolean,
  onPositionChange: (pos: number) => void,
  onPlayPause: (playing: boolean) => void
) {
  try {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === "sync_state" && isHost) {
      // Host: сообщаем позицию плеера сервиса в SyncEngine (для broadcast)
      onPositionChange(data.currentTime);
      onPlayPause(!data.paused);
    }
  } catch {
    // не JSON — игнорируем
  }
}

/** Определить DRM-сервис по URL или sourceID. */
function detectServiceID(url: string, sourceID?: string): DrmServiceID {
  if (sourceID && ["netflix", "disney", "kinopoisk", "okko", "wink"].includes(sourceID)) {
    return sourceID as DrmServiceID;
  }
  const lower = url.toLowerCase();
  if (lower.includes("netflix")) return "netflix";
  if (lower.includes("disneyplus") || lower.includes("disney")) return "disney";
  if (lower.includes("kinopoisk")) return "kinopoisk";
  if (lower.includes("okko")) return "okko";
  if (lower.includes("wink")) return "wink";
  return "kinopoisk"; // fallback
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  playerContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  video: { width: "100%", height: "100%" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { color: "#fff", marginTop: 8, fontSize: 14 },
  errorContainer: {
    width: "100%", aspectRatio: 16 / 9,
    backgroundColor: "#1E1E2A", borderRadius: 12,
    justifyContent: "center", alignItems: "center",
  },
  errorIcon: { fontSize: 40, marginBottom: 8 },
  errorText: { color: "#FF4545", fontSize: 14, textAlign: "center", paddingHorizontal: 20 },
  guestControls: {
    position: "absolute", top: 8, right: 8,
  },
  syncBadge: {
    backgroundColor: "rgba(115, 70, 235, 0.9)",
    color: "#fff", fontSize: 11, fontWeight: "600",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    overflow: "hidden",
  },
  seekControls: {
    position: "absolute", bottom: 12, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", gap: 16,
  },
  seekBtn: {
    backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8,
  },
  seekBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  webviewBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6,
  },
  webviewBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
