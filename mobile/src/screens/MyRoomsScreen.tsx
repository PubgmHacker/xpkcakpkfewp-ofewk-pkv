import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { Room } from "../types";
import type { RootStackParamList } from "../AppNavigator";
import { authHeaders } from "../store/authStore";
import { API_URL } from "../config";

type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;

// ─────────────────────────────────────────────────────────────────────────────
//  MyRoomsScreen — активные комнаты пользователя + история
// ─────────────────────────────────────────────────────────────────────────────

export default function MyRoomsScreen() {
  const navigation = useNavigation<NavProp>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        headers: { ...authHeaders() },
      });
      if (res.ok) setRooms(await res.json());
    } catch {
      // офлайн
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { loadRooms(); }, [loadRooms]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Мои комнаты</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#7346EB" />
      ) : rooms.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📺</Text>
          <Text style={styles.emptyText}>У вас пока нет комнат</Text>
          <Text style={styles.emptyHint}>Создайте комнату на главной!</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.roomCard}
              onPress={() => navigation.navigate("Room", { room: item })}
            >
              <Text style={styles.roomName}>{item.name}</Text>
              <Text style={styles.roomHost}>Хост: {item.hostName}</Text>
              <View style={styles.roomMeta}>
                <Text style={styles.roomCode}>{item.code}</Text>
                <Text style={styles.roomParticipants}>
                  👥 {item.participants.length}/{item.maxParticipants}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadRooms} tintColor="#7346EB" />
          }
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 12 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyIcon: { fontSize: 50, marginBottom: 12 },
  emptyText: { fontSize: 18, color: "#fff", fontWeight: "600" },
  emptyHint: { fontSize: 14, color: "#888", marginTop: 4 },
  roomCard: { backgroundColor: "#1E1E2A", borderRadius: 14, padding: 16 },
  roomName: { fontSize: 17, fontWeight: "600", color: "#fff" },
  roomHost: { fontSize: 13, color: "#888", marginTop: 4 },
  roomMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  roomCode: { fontSize: 13, color: "#7346EB", fontFamily: "monospace" },
  roomParticipants: { fontSize: 13, color: "#aaa" },
});
