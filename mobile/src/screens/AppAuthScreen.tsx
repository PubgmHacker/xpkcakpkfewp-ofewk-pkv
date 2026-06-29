import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from "react-native";
import { useAuthStore } from "../store/authStore";
import type { AppUser } from "../store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
//  AppAuthScreen — Глобальный экран входа в RaveClone (Уровень 1)
//
//  Методы:
//    • Google Sign-In       → POST /api/auth/google   { idToken }
//    • Apple ID             → POST /api/auth/apple    { idToken }
//    • VK ID                → POST /api/auth/vk       { accessToken }
//    • Email / Пароль       → POST /api/auth/signup | /api/auth/signin
//    • Гостевой вход        → POST /api/auth/guest    {}
//
//  После успеха бэкенд возвращает: { token, user: { id, username, avatar, isGuest } }
//  Сохраняем через authStore.setAuth() → AppNavigator пропускает дальше.
//
//  ⚠️ DRM-авторизация (Кинопоиск/Netflix) — НЕ здесь. Она в DrmSessionManager.
// ─────────────────────────────────────────────────────────────────────────────

import { API_URL } from "../config";

type AuthMethod = "google" | "apple" | "vk" | "email" | "guest";

export default function AppAuthScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState<AuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Универсальный обмен на JWT ──────────────────────────────────────────
  const exchange = async (
    method: AuthMethod,
    endpoint: string,
    body: Record<string, string>
  ): Promise<void> => {
    setLoading(method);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Ошибка авторизации (${res.status})`);
      }

      const { token, user } = await res.json();
      await setAuth(token, user as AppUser);
    } catch (e: any) {
      // В demo-режиме: если бэкенд недоступен, позволяем гостевой вход офлайн
      if (method === "guest" && e.message.includes("Network request failed")) {
        const fallbackUser: AppUser = {
          id: `guest_${Date.now()}`,
          username: `Raver_${Math.floor(1000 + Math.random() * 9000)}`,
          isGuest: true,
        };
        await setAuth(`offline_${fallbackUser.id}`, fallbackUser);
        return;
      }
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  // ─── Социальные входы ────────────────────────────────────────────────────
  const signInGoogle = () => {
    // ПРОД: expo-auth-session → Google.useIdTokenAuthRequest()
    Alert.alert(
      "Google Sign-In",
      "В продакшене используется expo-auth-session для получения id_token.",
      [{ text: "OK", onPress: () => exchange("google", "google", { idToken: "demo_google_token" }) }]
    );
  };

  const signInApple = () => {
    // ПРОД: expo-apple-authentication (только iOS, требует Apple Developer)
    Alert.alert(
      "Apple Sign-In",
      "Требует Apple Developer Account. Контракт: identityToken → /api/auth/apple",
      [{ text: "OK", onPress: () => exchange("apple", "apple", { idToken: "demo_apple_token" }) }]
    );
  };

  const signInVK = () => {
    // ПРОД: WebView OAuth → https://oauth.vk.com/authorize → access_token
    Alert.alert(
      "VK ID",
      "OAuth 2.0 через WebView. Контракт: access_token → /api/auth/vk",
      [{ text: "OK", onPress: () => exchange("vk", "vk", { accessToken: "demo_vk_token" }) }]
    );
  };

  // ─── Email/Password ──────────────────────────────────────────────────────
  const submitEmail = async () => {
    if (!email.includes("@") || password.length < 6) {
      setError("Введите корректный email и пароль (мин. 6 символов)");
      return;
    }
    if (mode === "signup" && username.trim().length < 2) {
      setError("Имя пользователя должно быть не короче 2 символов");
      return;
    }

    if (mode === "signup") {
      await exchange("email", "signup", { email, password, username });
    } else {
      await exchange("email", "signin", { email, password });
    }
  };

  // ─── Гостевой вход ───────────────────────────────────────────────────────
  const signInGuest = async () => {
    await exchange("guest", "guest", {});
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* ─── Бренд ─── */}
        <View style={styles.brand}>
          <Text style={styles.logo}>🎬</Text>
          <Text style={styles.title}>RaveClone</Text>
          <Text style={styles.subtitle}>Смотри вместе с друзьями</Text>
        </View>

        {/* ─── Email форма ─── */}
        <View style={styles.form}>
          {mode === "signup" && (
            <Input
              placeholder="Имя пользователя"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          )}
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            placeholder="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={submitEmail}
            disabled={!!loading}
          >
            {loading === "email" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "login" ? "Войти" : "Создать аккаунт"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Переключатель login/signup */}
          <TouchableOpacity onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>
            <Text style={styles.switchText}>
              {mode === "login"
                ? "Нет аккаунта? Зарегистрироваться"
                : "Уже есть аккаунт? Войти"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Разделитель ─── */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>или войти через</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ─── Социальные кнопки ─── */}
        <View style={styles.socialRow}>
          <SocialCircle icon="🔵" label="Google" onPress={signInGoogle} loading={loading === "google"} />
          <SocialCircle icon="" label="Apple" onPress={signInApple} loading={loading === "apple"} dark />
          <SocialCircle icon="🟦" label="VK" onPress={signInVK} loading={loading === "vk"} />
        </View>

        {/* ─── Гостевой вход ─── */}
        <TouchableOpacity style={styles.guestButton} onPress={signInGuest} disabled={!!loading}>
          {loading === "guest" ? (
            <ActivityIndicator color="#7346EB" />
          ) : (
            <Text style={styles.guestText}>👤 Продолжить как гость</Text>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.disclaimer}>
          Продолжая, вы соглашаетесь с Условиями использования и Политикой
          конфиденциальности. RaveClone не хранит ваш медиаконтент.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Подкомпоненты
// ═════════════════════════════════════════════════════════════════════════════

function Input(props: {
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "email-address";
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <TextInput
      style={styles.input}
      placeholder={props.placeholder}
      placeholderTextColor="#666"
      value={props.value}
      onChangeText={props.onChangeText}
      keyboardType={props.keyboardType || "default"}
      secureTextEntry={props.secureTextEntry}
      autoCapitalize={props.autoCapitalize || "none"}
      autoCorrect={false}
    />
  );
}

function SocialCircle(props: {
  icon: string;
  label: string;
  onPress: () => void;
  loading: boolean;
  dark?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.socialCircle, props.dark && styles.socialCircleDark]}
      onPress={props.onPress}
      disabled={props.loading}
    >
      {props.loading ? (
        <ActivityIndicator color={props.dark ? "#fff" : "#7346EB"} size="small" />
      ) : (
        <>
          <Text style={styles.socialIcon}>{props.icon}</Text>
          <Text style={[styles.socialLabel, props.dark && { color: "#fff" }]}>
            {props.label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F17" },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    paddingVertical: 40,
  },
  brand: { alignItems: "center", marginBottom: 36 },
  logo: { fontSize: 60, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 15, color: "#888", marginTop: 6 },
  form: { gap: 12, marginBottom: 20 },
  input: {
    backgroundColor: "#1E1E2A",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: "#7346EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switchText: { color: "#7346EB", textAlign: "center", marginTop: 12, fontSize: 14 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2A2A3A" },
  dividerText: { color: "#666", marginHorizontal: 12, fontSize: 13 },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: 20, marginBottom: 24 },
  socialCircle: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: "#1E1E2A",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#2A2A3A",
  },
  socialCircleDark: { backgroundColor: "#000", borderColor: "#333" },
  socialIcon: { fontSize: 24 },
  socialLabel: { color: "#aaa", fontSize: 11, marginTop: 4 },
  guestButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "#7346EB",
    borderRadius: 12,
    backgroundColor: "rgba(115, 70, 235, 0.08)",
  },
  guestText: { color: "#7346EB", fontSize: 15, fontWeight: "600" },
  error: { color: "#FF4545", textAlign: "center", marginTop: 14, fontSize: 13 },
  disclaimer: {
    color: "#555", fontSize: 11, textAlign: "center",
    marginTop: 20, lineHeight: 16,
  },
});
