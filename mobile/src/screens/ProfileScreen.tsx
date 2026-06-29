import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
//  ProfileScreen — профиль текущего пользователя RaveClone
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();

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
        <RowItem icon="🎬" label="Просмотрено комнат" value="0" />
        <RowItem icon="⏱️" label="Время в синхроне" value="0 мин" />
        <RowItem icon="👥" label="Друзья" value="0" />
      </View>

      <View style={styles.section}>
        <RowItem icon="🔔" label="Уведомления" value="" />
        <RowItem icon="🎨" label="Тема" value="Тёмная" />
        <RowItem icon="🔒" label="Конфиденциальность" value="" />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
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
