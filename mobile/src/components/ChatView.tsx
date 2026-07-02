import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from "react-native-reanimated";

import AnimatedGradientText from "./AnimatedGradientText";
import { getRoleConfig, formatNickname } from "../types/roles";
import type { ChatMessage } from "../types";
import type { UserRole } from "../types/roles";

// Активация LayoutAnimation для iOS/Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Ширина чата — 260pt (уменьшено с 280)
const CHAT_WIDTH = 260;

// ─────────────────────────────────────────────────────────────────────────────
//  ChatView — чат комнаты с поддержкой ролей и системных сообщений
//
//  Особенности:
//    • Свайп вправо для скрытия, влево для показа (как в Rave)
//    • Прозрачный фон alpha 0.7
//    • Аватарки пользователей рядом с каждым сообщением
//    • Кнопка выбора эмодзи в поле ввода
//    • Системные сообщения с ярким выделением
// ─────────────────────────────────────────────────────────────────────────────

interface ChatViewProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserRole: UserRole;
  onSend: (text: string) => void;
  participants?: Array<{ id: string; username: string; role: UserRole }>;
  /** Колбэк при свайпе чата (для скрытия/показа). */
  onSwipe?: (visible: boolean) => void;
  /** Управляемая видимость (если родитель контролирует). */
  forceVisible?: boolean;
}

// Часто используемые эмодзи
const QUICK_EMOJIS = ["😀", "😂", "🥰", "😎", "🔥", "👍", "❤️", "🎉", "😱", "🤔", "👀", "💀"];

export default function ChatView({
  messages,
  currentUserId,
  currentUserRole,
  onSend,
  onSwipe,
  forceVisible,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const listRef = useRef<FlatList>(null);

  // ─── Свайп для скрытия/показа чата ────────────────────────────────────────
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Только горизонтальные движения
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const threshold = CHAT_WIDTH * 0.3;
      if (e.translationX > threshold) {
        // Свайп вправо — скрыть
        translateX.value = withSpring(CHAT_WIDTH + 20, { damping: 20 });
        if (onSwipe) runOnJS(onSwipe)(false);
      } else if (e.translationX < -threshold) {
        // Свайп влево — показать
        translateX.value = withSpring(0, { damping: 20 });
        if (onSwipe) runOnJS(onSwipe)(true);
      } else {
        // Возврат
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  // Если родитель управляет видимостью
  useEffect(() => {
    if (forceVisible !== undefined) {
      translateX.value = withSpring(forceVisible ? 0 : CHAT_WIDTH + 20, { damping: 20 });
    }
  }, [forceVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

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
    setShowEmojiPanel(false);
  };

  const addEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.isSystem) {
      return <SystemMessageBubble message={item} />;
    }
    const isOwn = item.senderID === currentUserId;
    const role: UserRole = (item.senderRole as UserRole) || "user";
    return <ChatBubble message={item} isOwn={isOwn} role={role} />;
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.overlayContainer, animatedStyle]}>
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          {/* ─── Заголовок (полупрозрачный) ─── */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Чат</Text>
            <Text style={styles.headerCount}>{messages.length}</Text>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />

          {/* ─── Панель эмодзи ─── */}
          {showEmojiPanel && (
            <View style={styles.emojiPanel}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScroll}>
                {QUICK_EMOJIS.map((emoji) => (
                  <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => addEmoji(emoji)}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ─── Поле ввода с кнопкой эмодзи ─── */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={90}
          >
            <View style={styles.inputBar}>
              {/* Кнопка эмодзи */}
              <TouchableOpacity
                style={styles.emojiPickerBtn}
                onPress={() => setShowEmojiPanel(!showEmojiPanel)}
              >
                <Text style={styles.emojiPickerIcon}>{showEmojiPanel ? "⌨️" : "😊"}</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Сообщение..."
                placeholderTextColor="#888"
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
      </Animated.View>
    </GestureDetector>
  );
}

// Импорт ScrollView для emoji panel
import { ScrollView } from "react-native";

// ═════════════════════════════════════════════════════════════════════════════
//  ChatBubble — сообщение с аватаркой
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
  const initials = (message.senderName || "??").slice(0, 2).toUpperCase();

  return (
    <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
      {/* Аватарка для чужих сообщений */}
      {!isOwn && (
        <View style={[styles.avatar, { backgroundColor: cfg.color }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {!isOwn && (
          <View style={styles.nameRow}>
            <RoleBadge role={role} />
            <RoleName username={message.senderName} role={role} />
          </View>
        )}
        <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
          {message.text}
        </Text>
        <Text style={styles.time}>{formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

function RoleName({ username, role }: { username: string; role: UserRole }) {
  const cfg = getRoleConfig(role);
  const displayName = formatNickname(username, role);

  if (cfg.isAnimatedRed) {
    return (
      <View style={styles.adminNameWrap}>
        <AnimatedGradientText text={displayName} variant="adminRed" fontSize={13} />
      </View>
    );
  }

  if (role === "founder") {
    return (
      <View style={styles.adminNameWrap}>
        <AnimatedGradientText text={displayName} variant="founderGold" fontSize={13} />
      </View>
    );
  }

  return <Text style={[styles.name, { color: cfg.color }]}>{displayName}</Text>;
}

function RoleBadge({ role }: { role: UserRole }) {
  const cfg = getRoleConfig(role);
  if (!cfg.badge) return null;
  return <Text style={styles.badge}>{cfg.badge}</Text>;
}

function SystemMessageBubble({ message }: { message: ChatMessage }) {
  if (message.systemType === "admin_joined") {
    return (
      <View style={styles.systemBubbleCritical}>
        <Text style={styles.systemEmoji}>⚠️</Text>
        <Text style={styles.systemTextCritical}>{message.text}</Text>
      </View>
    );
  }

  if (message.severity === "warning" || message.systemType === "warning") {
    return (
      <View style={styles.systemBubbleWarning}>
        <Text style={styles.systemEmoji}>⛔</Text>
        <Text style={styles.systemTextWarning}>{message.text}</Text>
      </View>
    );
  }

  if (message.systemType === "kick" || message.systemType === "ban") {
    return (
      <View style={styles.systemBubbleCritical}>
        <Text style={styles.systemEmoji}>🔨</Text>
        <Text style={styles.systemTextCritical}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View style={styles.systemBubbleInfo}>
      <Text style={styles.systemTextInfo}>{message.text}</Text>
    </View>
  );
}

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
//  Стили — прозрачный фон alpha 0.7
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // ─── Контейнер оверлея — ширина 260, прозрачность 0.7 ───────────────────
  overlayContainer: {
    width: CHAT_WIDTH,
    backgroundColor: "rgba(15, 15, 23, 0.7)",  // alpha 0.7
    borderLeftWidth: 1,
    borderLeftColor: "rgba(115, 70, 235, 0.3)",
  },
  container: { flex: 1 },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(115, 70, 235, 0.15)",
  },
  headerTitle: { fontSize: 15, fontWeight: "bold", color: "#fff" },
  headerCount: { fontSize: 11, color: "#888" },

  list: { padding: 10, paddingBottom: 80 },

  // ─── Сообщения ────────────────────────────────────────────────────────────
  bubbleWrap: { marginVertical: 4, flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleWrapOwn: { flexDirection: "row-reverse" },
  bubbleWrapOther: { alignItems: "flex-start" },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  bubble: {
    maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  bubbleOwn: { backgroundColor: "rgba(115, 70, 235, 0.85)", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "rgba(30, 30, 42, 0.8)", borderBottomLeftRadius: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", marginBottom: 3, gap: 3 },
  name: { fontSize: 12, fontWeight: "700" },
  adminNameWrap: { height: 16, justifyContent: "center" },
  badge: { fontSize: 10 },
  text: { fontSize: 13, lineHeight: 17 },
  textOwn: { color: "#fff" },
  textOther: { color: "#E0E0E0" },
  time: { fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 3, alignSelf: "flex-end" },

  // ─── Системные сообщения ──────────────────────────────────────────────────
  systemBubbleCritical: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255, 23, 68, 0.15)",
    borderWidth: 1, borderColor: "rgba(255, 23, 68, 0.5)",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginVertical: 6, gap: 6,
  },
  systemEmoji: { fontSize: 14 },
  systemTextCritical: {
    fontSize: 12, fontWeight: "700", color: "#FF1744", textAlign: "center",
  },
  systemBubbleWarning: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255, 165, 0, 0.12)",
    borderWidth: 1, borderColor: "rgba(255, 165, 0, 0.4)",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    marginVertical: 4, gap: 6,
  },
  systemTextWarning: { fontSize: 11, fontWeight: "600", color: "#FFA500", textAlign: "center" },
  systemBubbleInfo: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 3,
  },
  systemTextInfo: { fontSize: 10, color: "#666", fontStyle: "italic" },

  // ─── Панель эмодзи ─────────────────────────────────────────────────────────
  emojiPanel: {
    backgroundColor: "rgba(30, 30, 42, 0.9)",
    borderTopWidth: 1, borderTopColor: "rgba(115, 70, 235, 0.2)",
    paddingVertical: 8,
  },
  emojiScroll: { paddingHorizontal: 8, gap: 4 },
  emojiBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginHorizontal: 2 },
  emojiText: { fontSize: 22 },

  // ─── Поле ввода ───────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 6,
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: "rgba(15, 15, 23, 0.9)", borderTopWidth: 1,
    borderTopColor: "rgba(115, 70, 235, 0.15)",
  },
  emojiPickerBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(115, 70, 235, 0.15)",
    alignItems: "center", justifyContent: "center",
  },
  emojiPickerIcon: { fontSize: 18 },
  input: {
    flex: 1, backgroundColor: "rgba(30, 30, 42, 0.8)", borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8,
    color: "#fff", fontSize: 14, maxHeight: 80,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#7346EB", alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: -2 },
});
