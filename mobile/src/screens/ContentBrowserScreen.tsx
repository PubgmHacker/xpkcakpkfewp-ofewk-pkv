import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";

import type { RootStackParamList } from "../AppNavigator";
import type { Room, MediaItem } from "../types";
import { authHeaders, useAuthStore } from "../store/authStore";
import { ENDPOINTS } from "../config";
import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ═════════════════════════════════════════════════════════════════════════════
//  ContentBrowserScreen — контент выбранного сервиса
//    • Верхняя карусель live-трансляций
//    • Ниже — тренды (сетка 2×2)
//    • Поле поиска сверху
//
//  Данные:
//    YouTube → GET /api/media/search?q=...  (YouTube Data API)
//    Kinopoisk → через тот же /api/media/extract с URL
// ═════════════════════════════════════════════════════════════════════════════

interface ContentItem {
  id: string;
  title: string;
  thumbnailURL: string;
  streamURL: string;
  isLive?: boolean;
  rating?: number;
}

export default function ContentBrowserScreen() {
  const route = useRoute<RouteProp<{ ContentBrowser: { serviceID: string; serviceName: string } }, "ContentBrowser">>();
  const { serviceID, serviceName } = route.params;
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Мок live + тренды (P0: заменить на реальный API через ENDPOINTS.mediaSearch)
  const liveItems: ContentItem[] = serviceID === "youtube" ? [
    { id: "l1", title: "Lo-Fi Radio 24/7 🎵", thumbnailURL: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=jfKfPfyJRdk", isLive: true },
    { id: "l2", title: "SpaceX Live Stream", thumbnailURL: "https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=21X5lGlDOfg", isLive: true },
    { id: "l3", title: "Gaming Live", thumbnailURL: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg", streamURL: "https://www.youtube.com/watch?v=5qap5aO4i9A", isLive: true },
  ] : [];

  const trendItems: ContentItem[] = [
    { id: "t1", title: `${serviceName} — Топ 1`, thumbnailURL: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", streamURL: "https://www.youtube.com/watch?v=zSWdZVtXT7E", rating: 8.7 },
    { id: "t2", title: `${serviceName} — Топ 2`, thumbnailURL: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", streamURL: "https://www.youtube.com/watch?v=Way9Dexny3w", rating: 8.5 },
    { id: "t3", title: `${serviceName} — Топ 3`, thumbnailURL: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", streamURL: "https://www.youtube.com/watch?v=uYPbbksJxIg", rating: 8.4 },
    { id: "t4", title: `${serviceName} — Топ 4`, thumbnailURL: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg", streamURL: "https://www.youtube.com/watch?v=mqqft2x_Aa4", rating: 7.8 },
  ];

  // ─── Поиск ─────────────────────────────────────────────────────────────────
  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${ENDPOINTS.mediaSearch}?q=${encodeURIComponent(query)}&limit=12`, {
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        // results доступны для дальнейшей обработки
        console.log("[ContentBrowser] search results:", data.results?.length || 0);
      }
    } catch {
      // офлайн — используем моки
    } finally {
      setSearching(false);
    }
  }, [query]);

  // ─── Создать комнату ──────────────────────────────────────────────────────
  const createRoom = useCallback(async (item: ContentItem) => {
    let mediaItem: Record<string, unknown> | undefined;

    try {
      const extractRes = await fetch(ENDPOINTS.mediaExtract, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url: item.streamURL }),
      });
      if (extractRes.ok) {
        const media = await extractRes.json();
        mediaItem = {
          id: `media_${Date.now()}`,
          title: media.title || item.title,
          thumbnailURL: media.thumbnailURL || item.thumbnailURL,
          streamURL: media.streamURL || item.streamURL,
          duration: media.duration,
          mediaType: "video",
          source: media.sourceID || serviceID,
          mode: media.mode,
          requiresSubscription: media.requiresSubscription || false,
          webviewBaseURL: media.webviewBaseURL,
          sourceName: media.sourceName,
        };
      }
    } catch {
      // extraction failed
    }

    try {
      const res = await fetch(ENDPOINTS.rooms, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: item.title.slice(0, 50),
          maxParticipants: 10,
          ...(mediaItem ? { mediaItem } : { mediaURL: item.streamURL }),
        }),
      });
      if (res.ok) {
        const room = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigation as any).navigate("Room", { room });
      }
    } catch {
      const offlineRoom: Room = {
        id: `local_${Date.now()}`,
        name: item.title.slice(0, 50),
        code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        hostID: user?.id || "me", hostName: user?.username || "You",
        participants: [],
        mediaItem: mediaItem ? mediaItem as unknown as MediaItem : null,
        isActive: true, maxParticipants: 10,
        createdAt: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation as any).navigate("Room", { room: offlineRoom });
    }
  }, [navigation, serviceID, user]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── Header с поиском ─── */}
      <View style={styles.header}>
        <Text style={styles.title}>{serviceName}</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск видео..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
            {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>🔍</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={trendItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 40 }}
        ListHeaderComponent={() => (
          <>
            {/* ─── Live карусель ─── */}
            {liveItems.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={styles.sectionTitle}>🔴 Сейчас в эфире</Text>
                <FlatList
                  horizontal
                  data={liveItems}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingTop: 14 }}
                  renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInRight.delay(index * 80).duration(400)}>
                      <ContentCard item={item} onPress={() => createRoom(item)} />
                    </Animated.View>
                  )}
                />
              </View>
            )}
            <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>📈 Тренды</Text>
            </View>
          </>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 80).duration(400)} style={{ flex: 1 }}>
            <ContentCard item={item} onPress={() => createRoom(item)} compact />
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

function ContentCard({ item, onPress, compact }: { item: ContentItem; onPress: () => void; compact?: boolean }) {
  const cardWidth = compact ? (SCREEN_WIDTH - 40 - 14) / 2 : SCREEN_WIDTH * 0.42;

  return (
    <TouchableOpacity style={[styles.card, { width: cardWidth }]} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: item.thumbnailURL }} style={styles.thumb} />
      {item.isLive && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
      {item.rating && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {item.rating}</Text>
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 14 },
  searchRow: { flexDirection: "row", gap: 10 },
  searchInput: {
    flex: 1, backgroundColor: "#1E1E2A", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, color: "#fff", fontSize: 15,
  },
  searchBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: "#7346EB", alignItems: "center", justifyContent: "center",
  },
  searchBtnText: { fontSize: 18 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  card: { borderRadius: 14, overflow: "hidden", backgroundColor: "#1E1E2A" },
  thumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  liveBadge: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#FF1744", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  ratingBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  ratingText: { color: "#FFD700", fontSize: 11, fontWeight: "700" },
  cardInfo: { padding: 10 },
  cardTitle: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 16 },
});
