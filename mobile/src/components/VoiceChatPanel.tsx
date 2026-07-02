// ═══════════════════════════════════════════════════════════════════════════
//  VoiceChatPanel — UI-панель голосового чата для RoomScreen
//
//  Содержит:
//    • Кнопка mute/unmute микрофона
//    • Список говорящих участников (индикатор audio level)
//    • Подсчёт подключённых через голос
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions,
} from "react-native";
import { VoiceChatService } from "../services/VoiceChatService";

interface VoiceChatPanelProps {
  voiceChat: VoiceChatService;
  roomID: string;
}

interface SpeakingPeer {
  userID: string;
  username: string;
  isSpeaking: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function VoiceChatPanel({ voiceChat, roomID }: VoiceChatPanelProps) {
  const [isEnabled, setIsEnabled] = useState(voiceChat.isEnabled);
  const [isMuted, setIsMuted] = useState(false);
  const [peers, setPeers] = useState<SpeakingPeer[]>([]);

  // ─── Включить голосовой чат ───────────────────────────────────────────────
  const toggleVoice = useCallback(async () => {
    if (isEnabled) {
      voiceChat.disable();
      setIsEnabled(false);
      setPeers([]);
    } else {
      await voiceChat.enable();
      setIsEnabled(true);

      // Callback: новый аудио-стрим от пира
      voiceChat.onPeerAudio = (userID, _stream) => {
        setPeers((prev) => {
          const exists = prev.find((p) => p.userID === userID);
          if (exists) {
            return prev.map((p) =>
              p.userID === userID ? { ...p, isSpeaking: true } : p,
            );
          }
          return [...prev, { userID, username: userID.slice(0, 8), isSpeaking: true }];
        });
      };

      voiceChat.onPeerLeft = (userID) => {
        setPeers((prev) => prev.filter((p) => p.userID !== userID));
      };
    }
  }, [isEnabled, voiceChat]);

  // ─── Mute/Unmute ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      // TODO: voiceChat.mute(next) когда добавим mute API
      return next;
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* ─── Главная кнопка голосового чата ─── */}
      <TouchableOpacity
        style={[styles.mainBtn, isEnabled && styles.mainBtnActive]}
        onPress={toggleVoice}
      >
        <Text style={styles.mainBtnIcon}>{isEnabled ? "🎤" : "🔇"}</Text>
        <Text style={styles.mainBtnLabel}>
          {isEnabled ? "Голос вкл." : "Включить голос"}
        </Text>
      </TouchableOpacity>

      {/* ─── Когда включён — показываем панель ─── */}
      {isEnabled && (
        <View style={styles.panel}>
          {/* ─── Mute ─── */}
          <TouchableOpacity
            style={[styles.muteBtn, isMuted && styles.muteBtnMuted]}
            onPress={toggleMute}
          >
            <Text style={styles.muteIcon}>{isMuted ? "🙈" : "🗣️"}</Text>
          </TouchableOpacity>

          {/* ─── Список участников ─── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.peersScroll}>
            {peers.length === 0 ? (
              <View style={styles.noPeers}>
                <Text style={styles.noPeersText}>Никто не подключился к голосовому чату</Text>
              </View>
            ) : (
              peers.map((peer) => (
                <View key={peer.userID} style={[styles.peerBubble, peer.isSpeaking && styles.peerSpeaking]}>
                  <Text style={styles.peerEmoji}>
                    {peer.isSpeaking ? "🔊" : "👤"}
                  </Text>
                  <Text style={styles.peerName} numberOfLines={1}>
                    {peer.username}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* ─── Счётчик ─── */}
          {peers.length > 0 && (
            <Text style={styles.counter}>{peers.length} в голосовом чате</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1E1E2A",
    borderTopWidth: 1,
    borderTopColor: "#2A2A3A",
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  mainBtnActive: {
    backgroundColor: "rgba(115, 70, 235, 0.1)",
  },
  mainBtnIcon: { fontSize: 18 },
  mainBtnLabel: { color: "#888", fontSize: 14, fontWeight: "600" },
  panel: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  muteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#7346EB",
    alignItems: "center",
    justifyContent: "center",
  },
  muteBtnMuted: {
    backgroundColor: "#FF1744",
  },
  muteIcon: { fontSize: 18 },
  peersScroll: {
    flex: 1,
  },
  noPeers: {
    paddingVertical: 8,
  },
  noPeersText: {
    color: "#555",
    fontSize: 12,
    fontStyle: "italic",
  },
  peerBubble: {
    backgroundColor: "#2A2A3A",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 8,
  },
  peerSpeaking: {
    backgroundColor: "rgba(115, 70, 235, 0.3)",
    borderWidth: 1,
    borderColor: "#7346EB",
  },
  peerEmoji: { fontSize: 12 },
  peerName: {
    color: "#ccc",
    fontSize: 12,
    fontWeight: "500",
    maxWidth: SCREEN_WIDTH * 0.2,
  },
  counter: {
    color: "#666",
    fontSize: 11,
  },
});
