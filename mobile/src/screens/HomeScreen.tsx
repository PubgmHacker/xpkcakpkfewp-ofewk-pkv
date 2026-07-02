import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, ActivityIndicator, Alert, Keyboard,
  Dimensions, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";

import type { Room, MediaItem } from "../types";
import type { RootStackParamList } from "../AppNavigator";
import { authHeaders, useAuthStore } from "../store/authStore";
import { API_URL, ENDPOINTS } from "../config";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;

// ═════════════════════════════════════════════════════════════════════════════
//  Мок-данные (заменяются реальными YouTube/Kinopoisk API через config.ts)
// ═════════════════════════════════════════════════════════════════════════════

interface LiveStream {
  id: string;
  title: string;
  thumbnailURL: string;
  streamURL: string;
  source: string;
  viewers: number;
}

interface TrendItem {
  id: string;
  title: string;
  thumbnailURL: string;
  streamURL: string;
  source: string;
  rating: number;
}

// Мок live-трансляций (P0: заменить на YouTube Data API eventType=live)
const MOCK_LIVE: LiveStream[] = [
  { id: "live1", title: "Lo-Fi Radio 🎵 | Круглосуточная музыка", thumbnailURL: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=jfKfPfyJRdk", source: "youtube", viewers: 12400 },
  { id: "live2", title: "SpaceX Live: Starship Launch", thumbnailURL: "https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=21X5lGlDOfg", source: "youtube", viewers: 89200 },
  { id: "live3", title: "Chess Tournament Live", thumbnailURL: "https://i.ytimg.com/vi/Q8Qjs9HlUvs/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=Q8Qjs9HlUvs", source: "youtube", viewers: 3100 },
  { id: "live4", title: "Cozy Fireplace 24/7 🔥", thumbnailURL: "https://i.ytimg.com/vi/L_LUpnjgPso/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=L_LUpnjgPso", source: "youtube", viewers: 540 },
  { id: "live5", title: "Live News 24h", thumbnailURL: "https://i.ytimg.com/vi/9Auq9mYxFEE/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=9Auq9mYxFEE", source: "youtube", viewers: 15600 },
  { id: "live6", title: "Gaming Stream: Top Games", thumbnailURL: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=5qap5aO4i9A", source: "youtube", viewers: 2300 },
];

// Мок трендов недели
const MOCK_TRENDS: TrendItem[] = [
  { id: "t1", title: "Interstellar", thumbnailURL: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", streamURL: "https://www.youtube.com/watch?v=zSWdZVtXT7E", source: "youtube", rating: 8.7 },
  { id: "t2", title: "Dune: Part Two", thumbnailURL: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", streamURL: "https://www.youtube.com/watch?v=Way9Dexny3w", source: "youtube", rating: 8.5 },
  { id: "t3", title: "Oppenheimer", thumbnailURL: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", streamURL: "https://www.youtube.com/watch?v=uYPbbksJxIg", source: "youtube", rating: 8.4 },
  { id: "t4", title: "The Batman", thumbnailURL: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg", streamURL: "https://www.youtube.com/watch?v=mqqft2x_Aa4", source: "youtube", rating: 7.8 },
];

// ═════════════════════════════════════════════════════════════════════════════
//  HomeScreen — визитная карточка
// ═════════════════════════════════════════════════════════════════════════════

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        headers: { ...authHeaders() },
      });
      if (res.ok) setRooms(await res.json());
    } catch {
      // офлайн-демо
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { loadRooms(); }, [loadRooms]);

  // ─── Создать комнату из контента ──────────────────────────────────────────
  const createRoomFromContent = useCallback(async (
    title: string, url: string, source: string, thumbnailURL?: string,
  ) => {
    let mediaItem: Record<string, unknown> | undefined;

    // Пытаемся извлечь медиа
    try {
      const extractRes = await fetch(ENDPOINTS.mediaExtract, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url }),
      });
      if (extractRes.ok) {
        const media = await extractRes.json();
        mediaItem = {
          id: `media_${Date.now()}`,
          title: media.title || title,
          thumbnailURL: media.thumbnailURL || thumbnailURL,
          streamURL: media.streamURL || url,
          duration: media.duration,
          mediaType: "video",
          source: media.sourceID || source,
          mode: media.mode,
          requiresSubscription: media.requiresSubscription || false,
          webviewBaseURL: media.webviewBaseURL,
          sourceName: media.sourceName,
        };
      }
    } catch {
      // fallback — без extraction, прямой URL
    }

    try {
      const res = await fetch(ENDPOINTS.rooms, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: title.slice(0, 50),
          maxParticipants: 10,
          ...(mediaItem ? { mediaItem } : { mediaURL: url }),
        }),
      });
      if (res.ok) {
        const room = await res.json();
        setShowCreate(false);
        navigation.navigate("Room", { room });
      }
    } catch {
      // офлайн-комната
      const offlineRoom: Room = {
        id: `local_${Date.now()}`,
        name: title.slice(0, 50),
        code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        hostID: user?.id || "me", hostName: user?.username || "You",
        participants: [],
        mediaItem: mediaItem ? mediaItem as unknown as MediaItem : null,
        isActive: true, maxParticipants: 10,
        createdAt: new Date().toISOString(),
      };
      setShowCreate(false);
      navigation.navigate("Room", { room: offlineRoom });
    }
  }, [navigation, user]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadRooms} tintColor="#7346EB" />
        }
      >
        {/* ─── Шапка с приветствием ─── */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Смотри вместе{"\n"}с друзьями 🎬</Text>
            <Text style={styles.heroSubtitle}>Привет, {user?.username || "Raver"}!</Text>
          </View>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const parent = navigation.getParent() as any;
              parent?.navigate?.("Profile");
            }}
          >
            <Text style={styles.avatarText}>
              {(user?.username || "R").slice(0, 2).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ─── Кнопки действий ─── */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={() => navigation.navigate("ServicePicker")}
          >
            <Text style={styles.primaryActionIcon}>➕</Text>
            <View>
              <Text style={styles.primaryActionText}>Создать комнату</Text>
              <Text style={styles.primaryActionHint}>Выберите сервис и контент</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={() => setShowJoin(true)}
          >
            <Text style={styles.secondaryActionIcon}>🔗</Text>
            <View>
              <Text style={styles.secondaryActionText}>Войти по коду</Text>
              <Text style={styles.secondaryActionHint}>6-значный код друга</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ─── Карусель "Сейчас смотрят" (LIVE) ─── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔴 Сейчас смотрят</Text>
          <Text style={styles.sectionHint}>Live трансляции</Text>
        </View>
        <FlatList
          horizontal
          data={MOCK_LIVE}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInRight.delay(index * 80).duration(400)}>
              <LiveCard item={item} onPress={() => createRoomFromContent(item.title, item.streamURL, item.source, item.thumbnailURL)} />
            </Animated.View>
          )}
        />

        {/* ─── Тренды недели ─── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📈 Тренды недели</Text>
        </View>
        <View style={styles.trendsGrid}>
          {MOCK_TRENDS.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(index * 100).duration(400)}
              style={styles.trendCardWrap}
            >
              <TrendCard item={item} onPress={() => createRoomFromContent(item.title, item.streamURL, item.source, item.thumbnailURL)} />
            </Animated.View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── Модалки ─── */}
      <CreateRoomModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={(room) => {
        setShowCreate(false);
        navigation.navigate("Room", { room });
      }} />

      <JoinRoomModal visible={showJoin} onClose={() => setShowJoin(false)} onJoined={(room) => {
        setShowJoin(false);
        navigation.navigate("Room", { room });
      }} />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Карточки
// ═════════════════════════════════════════════════════════════════════════════

const SERVICE_ICONS: Record<string, string> = {
  youtube: "▶️", vk: "🟦", rutube: "📺", web: "🌐",
};

function LiveCard({ item, onPress }: { item: LiveStream; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.liveCard} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: item.thumbnailURL }} style={styles.liveThumb} />
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <View style={styles.liveViewers}>
        <Text style={styles.liveViewersText}>👁 {formatViewers(item.viewers)}</Text>
      </View>
      <View style={styles.liveInfo}>
        <Text style={styles.liveTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.liveSource}>{SERVICE_ICONS[item.source] || "🎬"} {item.source}</Text>
      </View>
    </TouchableOpacity>
  );
}

function TrendCard({ item, onPress }: { item: TrendItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.trendCard} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: item.thumbnailURL }} style={styles.trendThumb} />
      <View style={styles.trendRating}>
        <Text style={styles.trendRatingText}>⭐ {item.rating}</Text>
      </View>
      <Text style={styles.trendTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );
}

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Модалка создания комнаты (упрощённая — поле имя + URL)
// ═════════════════════════════════════════════════════════════════════════════

function CreateRoomModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      let mediaItem: Record<string, unknown> | undefined;
      if (url.trim()) {
        setExtracting(true);
        try {
          const extractRes = await fetch(ENDPOINTS.mediaExtract, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ url: url.trim() }),
          });
          if (extractRes.ok) {
            const media = await extractRes.json();
            mediaItem = {
              id: `media_${Date.now()}`,
              title: media.title,
              thumbnailURL: media.thumbnailURL,
              streamURL: media.streamURL,
              duration: media.duration,
              mediaType: "video",
              source: media.sourceID,
              mode: media.mode,
              requiresSubscription: media.requiresSubscription || false,
            };
          }
        } catch {
          // экстракция не удалась
        } finally {
          setExtracting(false);
        }
      }

      const res = await fetch(ENDPOINTS.rooms, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          maxParticipants: 10,
          ...(mediaItem ? { mediaItem } : {}),
        }),
      });
      if (res.ok) {
        const room = await res.json();
        onCreated(room);
        setName(""); setUrl("");
      }
    } catch {
      onCreated({
        id: `local_${Date.now()}`,
        name: name.trim(),
        code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        hostID: "me", hostName: "You",
        participants: [], mediaItem: null,
        isActive: true, maxParticipants: 10,
        createdAt: new Date().toISOString(),
      });
      setName(""); setUrl("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Новая комната</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Название комнаты"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Ссылка на видео (опционально)"
            placeholderTextColor="#666"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={create} style={styles.modalCreate} disabled={creating || extracting}>
              {creating || extracting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalCreateText}>
                  {url.trim() ? "Извлечь и создать" : "Создать"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function JoinRoomModal({ visible, onClose, onJoined }: {
  visible: boolean;
  onClose: () => void;
  onJoined: (room: Room) => void;
}) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      Alert.alert("Ошибка", "Введите 6-значный код комнаты");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(ENDPOINTS.roomsJoin, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ code: clean }),
      });
      if (res.ok) {
        const room = await res.json();
        onJoined(room);
        setCode("");
        Keyboard.dismiss();
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Ошибка", err.error || "Комната не найдена");
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось подключиться к серверу");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Войти по коду</Text>
          <Text style={styles.modalHint}>Введите 6-значный код, который поделился хост</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="ABCDEF"
            placeholderTextColor="#666"
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={join}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={join} style={styles.modalCreate} disabled={joining || code.trim().length !== 6}>
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCreateText}>Войти</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const CARD_W = SCREEN_WIDTH * 0.42;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },

  // ─── Hero ─────────────────────────────────────────────────────────────────
  heroHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  heroTitle: { fontSize: 26, fontWeight: "bold", color: "#fff", lineHeight: 32 },
  heroSubtitle: { fontSize: 14, color: "#888", marginTop: 6 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#7346EB",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#9D7BFF",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  // ─── Action buttons ───────────────────────────────────────────────────────
  actionButtons: { paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  primaryActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#7346EB", borderRadius: 16, padding: 18,
  },
  primaryActionIcon: { fontSize: 26 },
  primaryActionText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  primaryActionHint: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  secondaryActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#1E1E2A", borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: "#2A2A3A",
  },
  secondaryActionIcon: { fontSize: 22 },
  secondaryActionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryActionHint: { color: "#888", fontSize: 12, marginTop: 2 },

  // ─── Sections ─────────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  sectionHint: { fontSize: 12, color: "#666" },

  // ─── Carousel ─────────────────────────────────────────────────────────────
  carouselContent: { paddingHorizontal: 20, gap: 14, paddingBottom: 24 },
  liveCard: {
    width: CARD_W, borderRadius: 14, overflow: "hidden",
    backgroundColor: "#1E1E2A",
  },
  liveThumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  liveBadge: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#FF1744", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  liveViewers: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3,
  },
  liveViewersText: { color: "#fff", fontSize: 10 },
  liveInfo: { padding: 10 },
  liveTitle: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 16 },
  liveSource: { color: "#888", fontSize: 11, marginTop: 4 },

  // ─── Trends grid 2x2 ──────────────────────────────────────────────────────
  trendsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 14, paddingBottom: 24 },
  trendCardWrap: { width: (SCREEN_WIDTH - 40 - 14) / 2 },
  trendCard: { borderRadius: 14, overflow: "hidden", backgroundColor: "#1E1E2A" },
  trendThumb: { width: "100%", aspectRatio: 2 / 3, backgroundColor: "#000" },
  trendRating: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  trendRatingText: { color: "#FFD700", fontSize: 11, fontWeight: "700" },
  trendTitle: { color: "#fff", fontSize: 14, fontWeight: "600", padding: 10 },

  // ─── Modals ───────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalContent: {
    backgroundColor: "#16161F", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  modalHint: { fontSize: 14, color: "#888", marginBottom: 16 },
  codeInput: {
    backgroundColor: "#1E1E2A", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14,
    color: "#fff", fontSize: 28, fontWeight: "bold", letterSpacing: 6,
    textAlign: "center", fontFamily: "monospace", marginBottom: 12,
  },
  modalInput: {
    backgroundColor: "#1E1E2A", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: "#fff", fontSize: 16, marginBottom: 12,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#333" },
  modalCancelText: { color: "#888", fontSize: 16 },
  modalCreate: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, backgroundColor: "#7346EB" },
  modalCreateText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
