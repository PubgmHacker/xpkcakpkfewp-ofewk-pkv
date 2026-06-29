import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Room, MediaItem } from "../types";
import type { RootStackParamList } from "../AppNavigator";
import { authHeaders } from "../store/authStore";
import { API_URL } from "../config";

type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        headers: { ...authHeaders() },
      });
      if (res.ok) setRooms(await res.json());
    } catch (e) {
      // офлайн-демо
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { loadRooms(); }, [loadRooms]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Комнаты</Text>
          <Text style={styles.subtitle}>{rooms.length} активных</Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.createBtnText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      {/* ─── List ─── */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#7346EB" />
      ) : rooms.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📺</Text>
          <Text style={styles.emptyText}>Нет активных комнат</Text>
          <Text style={styles.emptyHint}>Создайте комнату и позовите друзей!</Text>
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

      <CreateRoomModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={(room) => {
        setShowCreate(false);
        navigation.navigate("Room", { room });
      }} />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Модалка создания комнаты
// ═════════════════════════════════════════════════════════════════════════════

function CreateRoomModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          maxParticipants: 10,
          mediaURL: url.trim() || undefined,
        }),
      });
      if (res.ok) {
        const room = await res.json();
        onCreated(room);
        setName(""); setUrl("");
      }
    } catch {
      // офлайн: создаём локальную комнату
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
            <TouchableOpacity onPress={create} style={styles.modalCreate} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCreateText}>Создать</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 14, color: "#888", marginTop: 2 },
  createBtn: {
    backgroundColor: "#7346EB", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  createBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyIcon: { fontSize: 50, marginBottom: 12 },
  emptyText: { fontSize: 18, color: "#fff", fontWeight: "600" },
  emptyHint: { fontSize: 14, color: "#888", marginTop: 4 },
  roomCard: {
    backgroundColor: "#1E1E2A", borderRadius: 14, padding: 16,
  },
  roomName: { fontSize: 17, fontWeight: "600", color: "#fff" },
  roomHost: { fontSize: 13, color: "#888", marginTop: 4 },
  roomMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  roomCode: { fontSize: 13, color: "#7346EB", fontFamily: "monospace" },
  roomParticipants: { fontSize: 13, color: "#aaa" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalContent: {
    backgroundColor: "#16161F", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 },
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
