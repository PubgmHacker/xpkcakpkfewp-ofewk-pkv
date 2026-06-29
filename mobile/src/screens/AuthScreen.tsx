import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────────────────────────────────────
//  AuthScreen — Вход/Регистрация (аналог Rave)
//
//  Методы:
//    1. Google Sign-In
//    2. Apple ID Sign-In
//    3. VK ID
//    4. Гостевой вход (Raver_XXXX)
//
//  Все методы обменивают внешний токен (id_token от Google/Apple/VK) на наш JWT,
//  который хранится в AsyncStorage и используется во всех запросах к бэкенду.
// ─────────────────────────────────────────────────────────────────────────────

import { API_URL } from "../config";

type AuthMethod = "google" | "apple" | "vk" | "guest";

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [loading, setLoading] = useState<AuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Общий обмен внешнего токена на наш JWT ───────────────────────────────
  const exchangeToken = async (
    method: AuthMethod,
    payload: Record<string, string>
  ): Promise<void> => {
    setLoading(method);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Auth failed (${res.status})`);
      }

      const { token, user } = await res.json();

      // Сохраняем JWT + пользователя
      await AsyncStorage.multiSet([
        ["@jwt", token],
        ["@user", JSON.stringify(user)],
      ]);

      onAuth();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  // ─── 1. Google ────────────────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    // В реальном проекте: expo-auth-session с Google.
    // Здесь — упрощённый поток для демонстрации контракта.
    try {
      // const result = await GoogleIdentity.signIn();
      // exchangeToken("google", { idToken: result.idToken });
      Alert.alert(
        "Google Sign-In",
        "В продакшене: expo-auth-session → Google → id_token → backend /api/auth/google",
        [{ text: "OK", onPress: () => exchangeToken("google", { idToken: "demo_google_id_token" }) }]
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── 2. Apple ID ──────────────────────────────────────────────────────────
  const signInWithApple = async () => {
    // В реальном проекте: expo-apple-authentication.
    // Доступно только на iOS 13+ и требует Apple Developer Account.
    try {
      // const credential = await appleAuth.performRequest({
      //   requestedOperation: AppleAuthRequestOperation.LOGIN,
      //   requestedScopes: [AppleAuthRequestScope.EMAIL, AppleAuthRequestScope.FULL_NAME],
      // });
      // exchangeToken("apple", { idToken: credential.identityToken! });
      Alert.alert(
        "Apple Sign-In",
        "Требует Apple Developer Account. Контракт: id_token → backend /api/auth/apple",
        [{ text: "OK", onPress: () => exchangeToken("apple", { idToken: "demo_apple_id_token" }) }]
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── 3. VK ID ─────────────────────────────────────────────────────────────
  const signInWithVK = async () => {
    // VK ID использует OAuth 2.0 Implicit flow.
    // Пользователь входит через WebView vk.com → получаем access_token.
    try {
      // const result = await VKIDBridge.signIn();
      // exchangeToken("vk", { accessToken: result.access_token });
      Alert.alert(
        "VK ID",
        "OAuth 2.0 через WebView. Контракт: access_token → backend /api/auth/vk",
        [{ text: "OK", onPress: () => exchangeToken("vk", { accessToken: "demo_vk_access_token" }) }]
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── 4. Гостевой вход ─────────────────────────────────────────────────────
  const signInAsGuest = async () => {
    // Бэкенд сам генерирует имя (Raver_XXXX) и JWT.
    await exchangeToken("guest", {});
  };

  return (
    <View style={styles.container}>
      {/* ─── Логотип / Бренд ─── */}
      <View style={styles.brand}>
        <Text style={styles.logo}>🎬</Text>
        <Text style={styles.title}>RaveClone</Text>
        <Text style={styles.subtitle}>Смотри вместе с друзьями</Text>
      </View>

      {/* ─── Социальные кнопки ─── */}
      <View style={styles.buttonsContainer}>
        {/* Google */}
        <SocialButton
          label="Войти через Google"
          icon="🔵"
          color="#fff"
          textColor="#1a1a1a"
          onPress={signInWithGoogle}
          loading={loading === "google"}
          disabled={!!loading}
        />

        {/* Apple */}
        <SocialButton
          label="Войти через Apple"
          icon=""
          color="#fff"
          textColor="#1a1a1a"
          onPress={signInWithApple}
          loading={loading === "apple"}
          disabled={!!loading}
        />

        {/* VK */}
        <SocialButton
          label="Войти через VK ID"
          icon="🟦"
          color="#0077FF"
          textColor="#fff"
          onPress={signInWithVK}
          loading={loading === "vk"}
          disabled={!!loading}
        />
      </View>

      {/* ─── Разделитель ─── */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* ─── Гостевой вход ─── */}
      <TouchableOpacity
        style={styles.guestButton}
        onPress={signInAsGuest}
        disabled={!!loading}
      >
        {loading === "guest" ? (
          <ActivityIndicator color="#7346EB" />
        ) : (
          <Text style={styles.guestText}>👤 Продолжить как гость</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* ─── Информация о конфиденциальности ─── */}
      <Text style={styles.disclaimer}>
        Продолжая, вы соглашаетесь с Условиями использования и Политикой
        конфиденциальности. RaveClone не хранит ваш медиаконтент.
      </Text>
    </View>
  );
}

// ─── Компонент социальной кнопки ─────────────────────────────────────────────
function SocialButton({
  label,
  icon,
  color,
  textColor,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon: string;
  color: string;
  textColor: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.socialButton, { backgroundColor: color }]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          <Text style={styles.socialIcon}>{icon}</Text>
          <Text style={[styles.socialLabel, { color: textColor }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F17",
    paddingHorizontal: 30,
    justifyContent: "center",
  },
  brand: { alignItems: "center", marginBottom: 50 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 16, color: "#888", marginTop: 8 },
  buttonsContainer: { gap: 12 },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  socialIcon: { fontSize: 20 },
  socialLabel: { fontSize: 16, fontWeight: "600" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2A2A3A" },
  dividerText: { color: "#666", marginHorizontal: 16 },
  guestButton: {
    alignItems: "center",
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: "#7346EB",
    borderRadius: 12,
    backgroundColor: "rgba(115, 70, 235, 0.1)",
  },
  guestText: { color: "#7346EB", fontSize: 16, fontWeight: "600" },
  error: {
    color: "#FF4545",
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
  disclaimer: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 16,
  },
});
