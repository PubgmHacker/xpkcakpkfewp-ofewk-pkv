import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";

import type { RootStackParamList } from "../AppNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;

// ═════════════════════════════════════════════════════════════════════════════
//  Сервисы — без красного фона для YouTube (только логотип)
// ═════════════════════════════════════════════════════════════════════════════

interface ServiceDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  textColor: string;
  requiresSubscription: boolean;
  mode: "native" | "webview";
}

const SERVICES: ServiceDef[] = [
  // ─── Бесплатные (нативный плеер) ───────────────────────────────────────────
  { id: "youtube", name: "YouTube", emoji: "▶️", color: "#1E1E2A", textColor: "#fff", requiresSubscription: false, mode: "native" },
  { id: "rutube", name: "Rutube", emoji: "📺", color: "#1E1E2A", textColor: "#fff", requiresSubscription: false, mode: "native" },
  { id: "vk", name: "VK Видео", emoji: "🟦", color: "#1E1E2A", textColor: "#fff", requiresSubscription: false, mode: "native" },
  { id: "web", name: "Открытый веб", emoji: "🌐", color: "#1E1E2A", textColor: "#fff", requiresSubscription: false, mode: "native" },
  // ─── Платные DRM (WebView sync) ────────────────────────────────────────────
  { id: "kinopoisk", name: "Кинопоиск", emoji: "🎬", color: "#1E1E2A", textColor: "#fff", requiresSubscription: true, mode: "webview" },
  { id: "okko", name: "Okko", emoji: "🟠", color: "#1E1E2A", textColor: "#fff", requiresSubscription: true, mode: "webview" },
  { id: "wink", name: "Wink", emoji: "✨", color: "#1E1E2A", textColor: "#fff", requiresSubscription: true, mode: "webview" },
  { id: "premier", name: "Premier", emoji: "🎭", color: "#1E1E2A", textColor: "#fff", requiresSubscription: true, mode: "webview" },
];

export default function ServicePickerScreen() {
  const navigation = useNavigation<NavProp>();

  const onSelect = (service: ServiceDef) => {
    // Переход к ContentBrowserScreen с выбранным сервисом
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation as any).navigate("ContentBrowser", { serviceID: service.id, serviceName: service.name });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Выберите сервис</Text>
        <Text style={styles.subtitle}>Где будем смотреть вместе?</Text>
      </View>

      <FlatList
        data={SERVICES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        columnWrapperStyle={{ gap: 14 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).duration(350)} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.serviceCard, { backgroundColor: item.color }]}
              onPress={() => onSelect(item)}
              activeOpacity={0.85}
            >
              <Text style={styles.serviceEmoji}>{item.emoji}</Text>
              <Text style={[styles.serviceName, { color: item.textColor }]}>{item.name}</Text>
              {item.requiresSubscription ? (
                <View style={styles.subBadge}>
                  <Text style={styles.subBadgeText}>Подписка</Text>
                </View>
              ) : (
                <View style={[styles.subBadge, styles.freeBadge]}>
                  <Text style={[styles.subBadgeText, styles.freeBadgeText]}>Бесплатно</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 15, color: "#888", marginTop: 4 },
  serviceCard: {
    aspectRatio: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#2A2A3A",
    position: "relative",
  },
  serviceEmoji: { fontSize: 44, marginBottom: 10 },
  serviceName: { fontSize: 16, fontWeight: "700" },
  subBadge: {
    position: "absolute", bottom: 10,
    backgroundColor: "rgba(255,165,0,0.15)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  subBadgeText: { color: "#FFA500", fontSize: 9, fontWeight: "700" },
  freeBadge: { backgroundColor: "rgba(115,70,235,0.15)" },
  freeBadgeText: { color: "#7346EB" },
});
