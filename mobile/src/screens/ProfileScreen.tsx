import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore, authHeaders } from "../store/authStore";
import { API_URL } from "../config";

// ─────────────────────────────────────────────────────────────────────────────
//  ProfileScreen — профиль текущего пользователя RaveClone
//  Загружает реальные данные из /api/users/me/stats
// ─────────────────────────────────────────────────────────────────────────────

interface UserStats {
  friendsCount: number;
  roomsJoined: number;
  totalHoursWatched: number;
  sessionsCount: number;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/users/me/stats`, {
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn("[Profile] Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSignOut = async () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: async () => {
          // Notify server about signout
          try {
            await fetch(`${API_URL}/auth/signout`, {
              method: "POST",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
            });
          } catch {}
          await signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        {/* Аватар */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.username?.slice(0, 2).toUpperCase() ?? "?"}
          </Text>
        </View>

        <Text style={styles.username}>{user?.username ?? "Гость"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>

        {user?.isGuest && (
          <View style={styles.guestBadge}>
            <Text style={styles.guestBadgeText}>ГОСТЕВОЙ АККАУНТ</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        {loading ? (
          <ActivityIndicator color="#7346EB" style={{ padding: 20 }} />
        ) : (
          <>
            <RowItem icon="🎬" label="Просмотрено комнат" value={String(stats?.roomsJoined ?? 0)} />
            <RowItem icon="⏱️" label="Часов в синхроне" value={String(stats?.totalHoursWatched ?? 0)} />
            <RowItem icon="👥" label="Друзья" value={String(stats?.friendsCount ?? 0)} />
          </>
        )}
      </View>

      <View style={styles.section}>
        <RowItem icon="🔔" label="Уведомления" value="" />
        <RowItem icon="🎨" label="Тема" value="Тёмная" />
        <RowItem icon="🔒" label="Конфиденциальность" value="" />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>

      <Text style={styles.version}>RaveClone v1.0.0</Text>
    </SafeAreaView>
  );
}

function RowItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17", paddingHorizontal: 20, paddingTop: 20 },
  card: { alignItems: "center", paddingVertical: 28, backgroundColor: "#1E1E2A", borderRadius: 16, marginBottom: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#7346EB", alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  username: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  email: { fontSize: 14, color: "#888", marginTop: 4 },
  guestBadge: {
    marginTop: 10, backgroundColor: "rgba(255, 165, 0, 0.15)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  guestBadgeText: { color: "#FFA500", fontSize: 10, fontWeight: "bold" },
  section: { backgroundColor: "#1E1E2A", borderRadius: 16, marginBottom: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  rowIcon: { fontSize: 18, marginRight: 12 },
  rowLabel: { flex: 1, color: "#fff", fontSize: 15 },
  rowValue: { color: "#666", fontSize: 14 },
  signOutBtn: {
    backgroundColor: "rgba(255, 69, 69, 0.1)",
    borderWidth: 1, borderColor: "#FF4545",
    borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8,
  },
  signOutText: { color: "#FF4545", fontSize: 15, fontWeight: "600" },
  version: { color: "#444", fontSize: 12, textAlign: "center", marginTop: 24 },
});
