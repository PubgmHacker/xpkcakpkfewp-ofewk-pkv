import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Share, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";

import ChatView from "../components/ChatView";
import RoomPlayer from "../components/RoomPlayer";
import VoiceChatPanel from "../components/VoiceChatPanel";
import { useAuthStore } from "../store/authStore";
import { wsService } from "../services/wsService";
import { VoiceChatService } from "../services/VoiceChatService";
import type {
  ChatMessage, Room, UserRole,
} from "../types";
import type { RootStackParamList } from "../AppNavigator";
import type { RouteProp } from "@react-navigation/native";

// ─────────────────────────────────────────────────────────────────────────────
//  RoomScreen — экран комнаты с реальным WebSocket-соединением
//
//  Содержит:
//    • Видеоплеер (нативный для бесплатных, WebView для DRM)
//    • Чат с поддержкой ролей и системных сообщений (через WS)
//    • Синхронизация play/pause/seek (host→participants через WS)
//    • Участники с实时 обновлениями (join/leave/kick)
//    • Информация о комнате (код, кнопка share)
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Room">>();
  const { room: initialRoom } = route.params;
  const user = useAuthStore((s) => s.user);

  // ─── State ────────────────────────────────────────────────────────────────
  const [room, setRoom] = useState<Room>(() => ({
    ...initialRoom,
    participants: initialRoom.participants || [],
  }));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [wsState, setWsState] = useState<"connecting" | "connected" | "reconnecting" | "failed">("connecting");
  const [showScreenShareBtn, setShowScreenShareBtn] = useState(true);

  const roomID = room.id;
  const isHost = user?.id === room.hostID;
  const cleanupRefs = useRef<(() => void)[]>([]);
  const voiceChatRef = useRef<VoiceChatService | null>(null);

  // Singleton VoiceChatService на сессию комнаты
  if (!voiceChatRef.current && user?.id) {
    voiceChatRef.current = new VoiceChatService(user.id);
  }
  const voiceChat = voiceChatRef.current;

  // ─── Подключение к WebSocket + join room ──────────────────────────────────
  useEffect(() => {
    // Подключаем WS если ещё не подключён
    if (!wsService.isConnected) {
      wsService.connect();
    }

    // ─── Слушатель состояния подключения ─────────────────────────────────────
    const unsubConnState = wsService.on("_connection_state", (state: unknown) => {
      const s = state as "disconnected" | "reconnecting" | "failed";
      if (s === "disconnected") setWsState("reconnecting");
      else if (s === "reconnecting") setWsState("reconnecting");
      else if (s === "failed") setWsState("failed");
    });

    const unsubConnected = wsService.on("connected", () => {
      setWsState("connected");
    });

    // Слушатели
    const unsubState = wsService.on("room_state", (data) => {
      const d = data as import("../services/wsService").WSRoomState;
      if (d.roomID === roomID) {
        setIsPlaying(d.isPlaying);
        setCurrentPosition(d.currentMediaTime);
      }
    });

    const unsubJoin = wsService.on("participant_joined", (data) => {
      const d = data as import("../services/wsService").WSParticipantJoined;
      if (d.roomID === roomID) {
        setRoom((prev) => ({
          ...prev,
          participants: prev.participants.some((p) => p.id === d.userID)
            ? prev.participants
            : [
                ...prev.participants,
                { id: d.userID, username: d.username, isOnline: true, role: d.role as UserRole },
              ],
        }));
        // Уведомляем voice chat о новом пире
        voiceChat?.handlePeerJoined(d.userID, d.username);
      }
    });

    const unsubLeave = wsService.on("participant_left", (data) => {
      const d = data as import("../services/wsService").WSParticipantLeft;
      if (d.roomID === roomID) {
        setRoom((prev) => ({
          ...prev,
          participants: prev.participants.filter((p) => p.id !== d.userID),
        }));
        voiceChat?.handlePeerLeft(d.userID);
      }
    });

    const unsubChat = wsService.on("chat", (data) => {
      const d = data as import("../services/wsService").WSChatMessage;
      if (d.roomID === roomID) {
        setMessages((prev) => [...prev, d as unknown as ChatMessage]);
      }
    });

    const unsubClosed = wsService.on("room_closed", (data) => {
      const d = data as import("../services/wsService").WSRoomClosed;
      if (d.roomID === roomID) {
        Alert.alert("Комната закрыта", "Хост покинул комнату. Комната деактивирована.", [
          { text: "OK", onPress: () => navigateBack() },
        ]);
      }
    });

    const unsubKicked = wsService.on("kicked", (data) => {
      const d = data as import("../services/wsService").WSKicked;
      if (d.roomID === roomID) {
        Alert.alert("Кик", "Вы были удалены из комнаты администратором.", [
          { text: "OK", onPress: () => navigateBack() },
        ]);
      }
    });

    const unsubSync = wsService.on("message", (data) => {
      const d = data as import("../services/wsService").WSIncomingMessage;
      // Обработка sync-команд (play/pause/seek/changeMedia)
      if ("command" in d) {
        const cmd = d as import("../services/wsService").WSSyncCommand;
        if (cmd.roomID === roomID) {
          switch (cmd.command) {
            case "play":
              setIsPlaying(true);
              if (cmd.mediaTime !== undefined) setCurrentPosition(cmd.mediaTime);
              break;
            case "pause":
              setIsPlaying(false);
              if (cmd.mediaTime !== undefined) setCurrentPosition(cmd.mediaTime);
              break;
            case "seek":
              if (cmd.mediaTime !== undefined) setCurrentPosition(cmd.mediaTime);
              break;
            case "changeMedia":
              if (cmd.mediaItem) {
                setRoom((prev) => ({
                  ...prev,
                  mediaItem: cmd.mediaItem!,
                }));
                setCurrentPosition(0);
                setIsPlaying(false);
              }
              break;
          }
        }
      }
    });

    cleanupRefs.current = [
      unsubConnState, unsubConnected,
      unsubState, unsubJoin, unsubLeave, unsubChat, unsubClosed, unsubKicked, unsubSync,
    ];

    // Даём WS немного подключиться перед join
    const joinTimer = setTimeout(() => {
      wsService.joinRoom(roomID);
    }, 500);

    return () => {
      clearTimeout(joinTimer);
      cleanupRefs.current.forEach((unsub) => unsub());
      voiceChat?.disable();
      voiceChatRef.current = null;
      wsService.leaveRoom(roomID);
    };
  }, [roomID]);

  // ─── Возврат назад ────────────────────────────────────────────────────────
  const navigateBack = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = (route.params as any)?.navigation;
    nav?.goBack?.();
  }, [route.params]);

  // ─── Копирование кода ────────────────────────────────────────────────────
  const shareCode = useCallback(async () => {
    try {
      await Share.share({
        message: `Присоединяйся к моей комнате в Plink!\nКод: ${room.code}`,
      });
    } catch {}
  }, [room.code]);

  // ─── Отправка сообщения в чат ──────────────────────────────────────────────
  const sendMessage = useCallback(
    (text: string) => {
      if (!user) return;

      // Локально показываем сразу (optimistic)
      const localMsg: ChatMessage = {
        id: `local_${Date.now()}`,
        roomID,
        senderID: user.id,
        senderName: user.username,
        senderRole: (user.role as UserRole) || "user",
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, localMsg]);

      // Отправляем через WebSocket
      wsService.sendChat(roomID, user.id, text);
    },
    [roomID, user],
  );

  // ─── Sync колбэки от плеера (Host → broadcast) ────────────────────────────
  const handlePositionChange = useCallback(
    (pos: number) => {
      setCurrentPosition(pos);
      if (isHost) {
        wsService.sendSyncCommand({ command: "seek", roomID, mediaTime: pos, timestamp: Date.now() });
      }
    },
    [roomID, isHost],
  );

  const handlePlayPause = useCallback(
    (playing: boolean) => {
      setIsPlaying(playing);
      if (isHost) {
        wsService.sendSyncCommand({
          command: playing ? "play" : "pause",
          roomID,
          mediaTime: currentPosition,
          timestamp: Date.now(),
        });
      }
    },
    [roomID, isHost, currentPosition],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  // ─── Индикатор состояния подключения ───────────────────────────────────────
  const wsIndicator = () => {
    if (wsState === "connected") return null;
    const config = {
      connecting: { color: "#FFA500", text: "Подключение..." },
      reconnecting: { color: "#FFA500", text: "Переподключение..." },
      failed: { color: "#FF1744", text: "Связь потеряна" },
    }[wsState];
    return (
      <View style={[styles.wsIndicator, { backgroundColor: `${config.color}22` }]}>
        <ActivityIndicator size="small" color={config.color} />
        <Text style={[styles.wsIndicatorText, { color: config.color }]}>{config.text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
          <TouchableOpacity onPress={shareCode} style={styles.codeRow}>
            <Text style={styles.roomCode}>Код: {room.code}</Text>
            <Text style={styles.copyIcon}>📋</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.participantCount}>
          👥 {room.participants.length}/{room.maxParticipants}
        </Text>
        <TouchableOpacity
          style={[styles.chatBtn, showChat && styles.chatBtnActive]}
          onPress={() => setShowChat(!showChat)}
        >
          <Text style={styles.chatBtnText}>💬</Text>
          {messages.length > 0 && (
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText}>
                {messages.length > 99 ? "99+" : messages.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ─── Индикатор состояния WS ─── */}
      {wsIndicator()}

      {/* ─── Кнопка демонстрации экрана (только хост) ─── */}
      {isHost && room.mediaItem && (
        <TouchableOpacity style={styles.screenShareBtn} onPress={() => Alert.alert("Демонстрация", "Screen Share требует нативного билда (не Expo Go). Будет доступно в TestFlight сборке.")}>
          <Text style={styles.screenShareBtnText}>🖥 Демонстрация экрана</Text>
        </TouchableOpacity>
      )}

      {/* ─── Плеер ─── */}
      {room.mediaItem ? (
        <RoomPlayer
          media={room.mediaItem}
          isHost={isHost}
          currentPosition={currentPosition}
          isPlaying={isPlaying}
          onPositionChange={handlePositionChange}
          onPlayPause={handlePlayPause}
          roomID={roomID}
        />
      ) : (
        <View style={styles.noMedia}>
          <Text style={styles.noMediaIcon}>🎬</Text>
          <Text style={styles.noMediaText}>Нет медиа</Text>
          <Text style={styles.noMediaHint}>Хост ещё не добавил видео</Text>
        </View>
      )}

      {/* ─── Чат или информация ─── */}
      {showChat ? (
        <View style={styles.chatContainer}>
          <ChatView
            messages={messages}
            currentUserId={user?.id || "me"}
            currentUserRole={(user?.role as UserRole) || "user"}
            onSend={sendMessage}
            participants={room.participants.map((p) => ({
              id: p.id,
              username: p.username,
              role: (p.role as UserRole) || "user",
            }))}
          />
        </View>
      ) : (
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Участники ({room.participants.length})</Text>
          <ScrollView>
            {room.participants.length === 0 ? (
              <Text style={styles.emptyText}>Пока никого нет. Поделитесь кодом комнаты!</Text>
            ) : (
              room.participants.map((p) => (
                <View key={p.id} style={styles.participantRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(p.username || "??").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.participantName}>{p.username}</Text>
                  {p.id === room.hostID && <Text style={styles.hostBadge}>👑 Хост</Text>}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ─── Voice Chat Panel ─── */}
      {voiceChat && (
        <VoiceChatPanel voiceChat={voiceChat} roomID={roomID} />
      )}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  wsIndicator: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 6, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  wsIndicatorText: { fontSize: 12, fontWeight: "600" },
  screenShareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(115, 70, 235, 0.12)", paddingVertical: 8, gap: 6,
    borderBottomWidth: 1, borderBottomColor: "rgba(115, 70, 235, 0.2)",
  },
  screenShareBtnText: { color: "#7346EB", fontSize: 12, fontWeight: "600" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#1E1E2A",
  },
  roomName: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  codeRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 },
  roomCode: { fontSize: 12, color: "#7346EB", fontFamily: "monospace" },
  copyIcon: { fontSize: 11 },
  participantCount: { fontSize: 12, color: "#aaa", marginRight: 12 },
  chatBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#1E1E2A", alignItems: "center", justifyContent: "center",
  },
  chatBtnActive: { backgroundColor: "#7346EB" },
  chatBtnText: { fontSize: 18 },
  chatBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: "#FF1744", borderRadius: 10,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  chatBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  noMedia: {
    aspectRatio: 16 / 9, backgroundColor: "#1E1E2A",
    alignItems: "center", justifyContent: "center",
  },
  noMediaIcon: { fontSize: 48, marginBottom: 8 },
  noMediaText: { fontSize: 16, color: "#888", fontWeight: "600" },
  noMediaHint: { fontSize: 13, color: "#555", marginTop: 4 },
  chatContainer: { flex: 1 },
  infoContainer: { flex: 1, padding: 16 },
  infoTitle: { fontSize: 16, fontWeight: "bold", color: "#fff", marginBottom: 12 },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", marginTop: 20 },
  participantRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E1E2A",
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#7346EB", alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  participantName: { flex: 1, color: "#fff", fontSize: 15 },
  hostBadge: { color: "#FFB300", fontSize: 12, fontWeight: "600" },
});
