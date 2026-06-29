import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";

import ChatView from "../components/ChatView";
import RoomPlayer from "../components/RoomPlayer";
import { authHeaders } from "../store/authStore";
import type { ChatMessage } from "../types";
import type { RootStackParamList } from "../AppNavigator";
import type { RouteProp } from "@react-navigation/native";
import { API_URL } from "../config";

// ─────────────────────────────────────────────────────────────────────────────
//  RoomScreen — экран комнаты
//
//  Содержит:
//    • Видеоплеер (нативный для бесплатных, WebView для DRM)
//    • Чат с поддержкой ролей и системных сообщений
//    • Информация о комнате (код, участники)
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Room">>();
  const room = route.params.room;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);

  // ─── Отправка сообщения ─────────────────────────────────────────────────
  const sendMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: `local_${Date.now()}`,
      roomID: room.id,
      senderID: "me",
      senderName: "Вы",
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
  }, [room.id]);

  // ─── Заглушка для плеера (пока нет WebSocket-соединения) ──────────────────
  const handlePositionChange = useCallback((pos: number) => {
    setCurrentPosition(pos);
  }, []);

  const handlePlayPause = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
          <Text style={styles.roomCode}>Код: {room.code} · {room.participants.length} участ.</Text>
        </View>
        <TouchableOpacity
          style={[styles.chatBtn, showChat && styles.chatBtnActive]}
          onPress={() => setShowChat(!showChat)}
        >
          <Text style={styles.chatBtnText}>💬</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Плеер ─── */}
      {room.mediaItem ? (
        <RoomPlayer
          media={room.mediaItem}
          isHost={room.hostID === "me"}
          currentPosition={currentPosition}
          isPlaying={isPlaying}
          onPositionChange={handlePositionChange}
          onPlayPause={handlePlayPause}
          roomID={room.id}
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
            currentUserId="me"
            currentUserRole="founder"
            onSend={sendMessage}
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
                      {p.username.slice(0, 2).toUpperCase()}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#1E1E2A",
  },
  roomName: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  roomCode: { fontSize: 12, color: "#888", marginTop: 2 },
  chatBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#1E1E2A", alignItems: "center", justifyContent: "center",
  },
  chatBtnActive: { backgroundColor: "#7346EB" },
  chatBtnText: { fontSize: 18 },
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
