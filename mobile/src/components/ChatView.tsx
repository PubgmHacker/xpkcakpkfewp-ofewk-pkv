import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AnimatedGradientText from "./AnimatedGradientText";
import { getRoleConfig, formatNickname } from "../types/roles";
import type { ChatMessage } from "../types";
import type { UserRole } from "../types/roles";

// Активация LayoutAnimation для iOS/Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ChatView — чат комнаты с поддержкой ролей и системных сообщений
//
//  Особенности:
//    • Системные сообщения (вход админа, предупреждения, кик) — яркое выделение
//    • Ник админа — анимированный красный градиент + префикс "[А]"
//    • Ник основателя — золотой + "👑"
//    • Ник модератора — синий + "🛡️"
//    • Сообщения с анимацией появления
// ─────────────────────────────────────────────────────────────────────────────

interface ChatViewProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserRole: UserRole;
  onSend: (text: string) => void;
  /** Список участников (для проверки ролей). */
  participants?: Array<{ id: string; username: string; role: UserRole }>;
}

export default function ChatView({
  messages,
  currentUserId,
  currentUserRole,
  onSend,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    if (messages.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [messages.length]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    // ─── Системные сообщения (отдельная отрисовка) ────────────────────────
    if (item.isSystem) {
      return <SystemMessageBubble message={item} />;
    }

    // ─── Обычное сообщение ────────────────────────────────────────────────
    const isOwn = item.senderID === currentUserId;
    const role: UserRole = (item.senderRole as UserRole) || "user";

    return <ChatBubble message={item} isOwn={isOwn} role={role} />;
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Чат комнаты</Text>
        <Text style={styles.headerCount}>{messages.length} сообщ.</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Написать сообщение..."
            placeholderTextColor="#666"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim()}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ChatBubble — обычное сообщение пользователя
// ═════════════════════════════════════════════════════════════════════════════

function ChatBubble({
  message,
  isOwn,
  role,
}: {
  message: ChatMessage;
  isOwn: boolean;
  role: UserRole;
}) {
  const cfg = getRoleConfig(role);

  return (
    <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
      <View style={[
        styles.bubble,
        isOwn ? styles.bubbleOwn : styles.bubbleOther,
      ]}>
        {/* ─── Никнейм (с цветом/градиентом по роли) ─── */}
        {!isOwn && (
          <View style={styles.nameRow}>
            <RoleBadge role={role} />
            <RoleName username={message.senderName} role={role} />
          </View>
        )}

        {/* ─── Текст ─── */}
        <Text style={[
          styles.text,
          isOwn ? styles.textOwn : styles.textOther,
        ]}>
          {message.text}
        </Text>

        {/* ─── Время ─── */}
        <Text style={styles.time}>{formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  RoleName — никнейм с цветом по роли (админ → анимированный градиент)
// ═════════════════════════════════════════════════════════════════════════════

function RoleName({ username, role }: { username: string; role: UserRole }) {
  const cfg = getRoleConfig(role);
  const displayName = formatNickname(username, role);

  // ─── АДМИН: анимированный красный переливающийся градиент ──────────────
  if (cfg.isAnimatedRed) {
    return (
      <View style={styles.adminNameWrap}>
        <AnimatedGradientText text={displayName} variant="adminRed" fontSize={13} />
      </View>
    );
  }

  // ─── ОСНОВАТЕЛЬ: золотой перелив ────────────────────────────────────────
  if (role === "founder") {
    return (
      <View style={styles.adminNameWrap}>
        <AnimatedGradientText text={displayName} variant="founderGold" fontSize={13} />
      </View>
    );
  }

  // ─── Остальные роли: обычный цветной текст ──────────────────────────────
  return <Text style={[styles.name, { color: cfg.color }]}>{displayName}</Text>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  RoleBadge — бейдж-эмодзи после ника
// ═════════════════════════════════════════════════════════════════════════════

function RoleBadge({ role }: { role: UserRole }) {
  const cfg = getRoleConfig(role);
  if (!cfg.badge) return null;
  return <Text style={styles.badge}>{cfg.badge}</Text>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  SystemMessageBubble — системные сообщения (вход админа, кик, предупреждения)
// ═════════════════════════════════════════════════════════════════════════════

function SystemMessageBubble({ message }: { message: ChatMessage }) {
  const isCritical = message.severity === "critical";
  const isWarning = message.severity === "warning" || message.systemType === "warning";

  // ─── ⚠️ Вход админа — ярко-красное выделение ────────────────────────────
  if (message.systemType === "admin_joined") {
    return (
      <View style={styles.systemBubbleCritical}>
        <Text style={styles.systemEmoji}>⚠️</Text>
        <Text style={styles.systemTextCritical}>{message.text}</Text>
      </View>
    );
  }

  // ─── Предупреждение за поведение (1/3, 2/3, 3/3) ───────────────────────
  if (isWarning) {
    return (
      <View style={styles.systemBubbleWarning}>
        <Text style={styles.systemEmoji}>⛔</Text>
        <Text style={styles.systemTextWarning}>{message.text}</Text>
      </View>
    );
  }

  // ─── Кик/Бан ────────────────────────────────────────────────────────────
  if (message.systemType === "kick" || message.systemType === "ban") {
    return (
      <View style={styles.systemBubbleCritical}>
        <Text style={styles.systemEmoji}>🔨</Text>
        <Text style={styles.systemTextCritical}>{message.text}</Text>
      </View>
    );
  }

  // ─── Обычное системное (info) ───────────────────────────────────────────
  return (
    <View style={styles.systemBubbleInfo}>
      <Text style={styles.systemTextInfo}>{message.text}</Text>
    </View>
  );
}

// ═══════════════/index.tsx══════════════════════════════════════════════════════════════════
//  Утилиты
// ═════════════════════════════════════════════════════════════════════════════

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1E1E2A",
  },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  headerCount: { fontSize: 12, color: "#666" },

  list: { padding: 12, paddingBottom: 80 },

  // ─── Обычные сообщения ──────────────────────────────────────────────────
  bubbleWrap: { marginVertical: 4 },
  bubbleWrapOwn: { alignItems: "flex-end" },
  bubbleWrapOther: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
  },
  bubbleOwn: { backgroundColor: "#7346EB", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#1E1E2A", borderBottomLeftRadius: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 4 },
  name: { fontSize: 13, fontWeight: "700" },
  adminNameWrap: { height: 18, justifyContent: "center" },
  badge: { fontSize: 12 },
  text: { fontSize: 14, lineHeight: 18 },
  textOwn: { color: "#fff" },
  textOther: { color: "#E0E0E0" },
  time: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, alignSelf: "flex-end" },

  // ─── Системные сообщения ────────────────────────────────────────────────
  systemBubbleCritical: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255, 23, 68, 0.15)",
    borderWidth: 1, borderColor: "rgba(255, 23, 68, 0.5)",
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
    marginVertical: 8, gap: 8,
  },
  systemEmoji: { fontSize: 16 },
  systemTextCritical: {
    fontSize: 13, fontWeight: "700", color: "#FF1744", textAlign: "center",
    textShadowColor: "rgba(255, 23, 68, 0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  systemBubbleWarning: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255, 165, 0, 0.12)",
    borderWidth: 1, borderColor: "rgba(255, 165, 0, 0.4)",
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
    marginVertical: 6, gap: 8,
  },
  systemTextWarning: {
    fontSize: 12, fontWeight: "600", color: "#FFA500", textAlign: "center",
  },
  systemBubbleInfo: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginVertical: 4,
  },
  systemTextInfo: { fontSize: 11, color: "#666", fontStyle: "italic" },

  // ─── Поле ввода ─────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#0F0F17", borderTopWidth: 1, borderTopColor: "#1E1E2A",
  },
  input: {
    flex: 1, backgroundColor: "#1E1E2A", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: "#fff", fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#7346EB", alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: -2 },
});
