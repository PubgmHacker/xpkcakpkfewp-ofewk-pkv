import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSyncExternalStore } from "react";

import { DrmSessionManager, DRM_SERVICES } from "../services/DrmSessionManager";
import type { DrmServiceID, DrmSession } from "../services/DrmSessionManager";
import { useAuthStore } from "../store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
//  DrmOverlay — внутренний блокирующий экран для DRM-сервисов
//
//  Сценарий:
//    Пользователь открыл комнату с Кинопоиском.
//    Он залогинен в RaveClone (ник: Raver_55),
//    но НЕ залогинен в Кинопоиске.
//
//    ┌─────────────────────────────────────────────┐
//    │                                               │
//    │        🎬  Требуется Кинопоиск                 │
//    │                                               │
//    │   Вы вошли как Raver_55,                      │
//    │   но для этого фильма нужна подписка          │
//    │   Кинопоиска.                                 │
//    │                                               │
//    │   Привяжите свой аккаунт Кинопоиска:          │
//    │   у каждого зрителя должен быть свой.          │
//    │                                               │
//    │      [ Привязать аккаунт Кинопоиска ]         │
//    │                                               │
//    │   ⓘ Это НЕ затронет ваш вход в RaveClone.     │
//    │     Куки Кинопоиска хранятся изолированно.    │
//    │                                               │
//    └─────────────────────────────────────────────┘
//
//  После нажатия открывается полноэкранный WebView с loginURL сервиса.
//  Пользователь входит в СВОЙ легальный аккаунт → куки сохраняются
//  в DrmSessionManager → overlay закрывается → RoomPlayer запускает видео.
// ─────────────────────────────────────────────────────────────────────────────

interface DrmOverlayProps {
  /** Какой DRM-сервис нужен для текущего контента. */
  serviceID: DrmServiceID;
  /** Вызывается, когда пользователь успешно привязал аккаунт. */
  onAuthenticated: () => void;
  /** Вызывается, если пользователь закрыл overlay без входа. */
  onDismiss: () => void;
}

export default function DrmOverlay({ serviceID, onAuthenticated, onDismiss }: DrmOverlayProps) {
  const service = DRM_SERVICES[serviceID];
  const user = useAuthStore((s) => s.user);
  const session = useDrmSession(serviceID);
  const [showWebView, setShowWebView] = useState(false);

  // Если уже авторизован — не показываем overlay
  if (session.status === "authenticated") {
    return null;
  }

  // ─── WebView для привязки аккаунта ───────────────────────────────────────
  if (showWebView) {
    return (
      <DrmLoginWebView
        serviceID={serviceID}
        onSuccess={(accountName) => {
          setShowWebView(false);
          DrmSessionManager.setAuthenticated(serviceID, accountName)
            .then(onAuthenticated);
        }}
        onCancel={() => setShowWebView(false)}
      />
    );
  }

  // ─── Блокирующий Overlay ─────────────────────────────────────────────────
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* Иконка сервиса */}
        <View style={[styles.serviceIcon, { backgroundColor: `${service.color}22` }]}>
          <Text style={styles.serviceEmoji}>{service.icon}</Text>
        </View>

        {/* Заголовок */}
        <Text style={styles.title}>{service.name}</Text>
        <Text style={styles.subtitle}>Требуется авторизация</Text>

        {/* Информация о пользователе */}
        <View style={styles.userInfo}>
          <Text style={styles.userInfoLabel}>Вы вошли в RaveClone как</Text>
          <Text style={styles.username}>{user?.username ?? "Гость"}</Text>
        </View>

        {/* Объяснение */}
        <Text style={styles.explanation}>
          Для просмотра этого фильма нужна подписка{" "}
          <Text style={{ fontWeight: "700", color: service.color }}>{service.name}</Text>.
          Привяжите свой аккаунт — у каждого зрителя должен быть свой.
        </Text>

        {/* Кнопка привязки */}
        <TouchableOpacity
          style={[styles.bindButton, { backgroundColor: service.color }]}
          onPress={() => {
            DrmSessionManager.startAuth(serviceID);
            setShowWebView(true);
          }}
        >
          <Text style={styles.bindButtonText}>
            Привязать аккаунт {service.name}
          </Text>
        </TouchableOpacity>

        {/* Отмена */}
        <TouchableOpacity onPress={onDismiss} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Не сейчас</Text>
        </TouchableOpacity>

        {/* Информер об изоляции */}
        <View style={styles.isolationNote}>
          <Text style={styles.isolationIcon}>🔒</Text>
          <Text style={styles.isolationText}>
            Это НЕ затронет ваш вход в RaveClone. Данные {service.name}{" "}
            хранятся изолированно внутри WebView.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  DrmLoginWebView — полноэкранный WebView для входа в DRM-сервис
// ═════════════════════════════════════════════════════════════════════════════

function DrmLoginWebView({ serviceID, onSuccess, onCancel }: {
  serviceID: DrmServiceID;
  onSuccess: (accountName?: string) => void;
  onCancel: () => void;
}) {
  const service = DRM_SERVICES[serviceID];

  // JS-инъекция: после загрузки страницы пытаемся определить, вошёл ли пользователь.
  // Каждый сервис имеет свои признаки авторизации (селекторы DOM).
  const detectAuthJS = getAuthDetectionScript(serviceID);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={styles.webviewContainer}>
        <View style={styles.webviewHeader}>
          <TouchableOpacity onPress={onCancel} style={styles.webviewClose}>
            <Text style={styles.webviewCloseText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.webviewTitle}>{service.name} — Вход</Text>
          <View style={{ width: 40 }} />
        </View>

        <WebView
          source={{ uri: service.loginURL }}
          // Разрешаем куки (нужны для сессии)
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          // Детектор авторизации
          injectedJavaScript={detectAuthJS}
          onMessage={(event) => {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.authenticated) {
              onSuccess(data.accountName);
            }
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  JS-инъекции для определения успешного входа (per-сервис)
// ═════════════════════════════════════════════════════════════════════════════

function getAuthDetectionScript(serviceID: DrmServiceID): string {
  // Общий паттерн: проверяем наличие элементов, которые появляются ТОЛЬКО
  // после входа (аватар, кнопка «профиль», исчезновение формы входа).
  const scripts: Record<DrmServiceID, string> = {
    kinopoisk: `
      const avatar = document.querySelector('[data-testid="user_avatar"], .header__user, .nav__user');
      const accountName = document.querySelector('.header__username, [data-testid="user_name"]')?.textContent?.trim();
      ReactNativeWebView.postMessage(JSON.stringify({
        authenticated: !!avatar,
        accountName: accountName || undefined,
      }));
    `,
    netflix: `
      const profileIcon = document.querySelector('.profile-icon, [data-uia="profiles-profile-link"]');
      ReactNativeWebView.postMessage(JSON.stringify({
        authenticated: !!profileIcon && !window.location.href.includes('/login'),
        accountName: profileIcon?.textContent?.trim(),
      }));
    `,
    disney: `
      const avatar = document.querySelector('[aria-label*="Profile"], .avatar, [data-testid="avatar"]');
      ReactNativeWebView.postMessage(JSON.stringify({
        authenticated: !!avatar && !window.location.href.includes('/login'),
        accountName: undefined,
      }));
    `,
    okko: `
      const userMenu = document.querySelector('.header__profile, [class*="profile"]');
      ReactNativeWebView.postMessage(JSON.stringify({
        authenticated: !!userMenu && !window.location.href.includes('/login'),
        accountName: undefined,
      }));
    `,
    wink: `
      const profileBtn = document.querySelector('[class*="profile"], [class*="user-menu"]');
      ReactNativeWebView.postMessage(JSON.stringify({
        authenticated: !!profileBtn && !window.location.href.includes('/auth'),
        accountName: undefined,
      }));
    `,
  };

  // Запускаем проверку каждые 1.5 секунды (пользователь может ещё вводить пароль)
  return `
    (function() {
      if (window.__drmCheckStarted) return;
      window.__drmCheckStarted = true;
      const check = () => {
        try {
          ${scripts[serviceID]}
        } catch(e) {}
      };
      setInterval(check, 1500);
      check();
    })();
    true;
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
//  React-хук для подписки на DrmSessionManager
// ═════════════════════════════════════════════════════════════════════════════

function useDrmSession(serviceID: DrmServiceID): DrmSession {
  return useSyncExternalStore(
    (cb) => DrmSessionManager.subscribe(cb),
    () => DrmSessionManager.getSession(serviceID)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Стили
// ═════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#16161F",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  serviceIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  serviceEmoji: { fontSize: 36 },
  title: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 14, color: "#888", marginTop: 4, marginBottom: 20 },
  userInfo: {
    backgroundColor: "#1E1E2A", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, width: "100%",
    alignItems: "center",
  },
  userInfoLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  username: { fontSize: 16, fontWeight: "600", color: "#7346EB" },
  explanation: {
    fontSize: 14, color: "#bbb", textAlign: "center",
    lineHeight: 20, marginBottom: 24,
  },
  bindButton: {
    width: "100%", paddingVertical: 16, borderRadius: 12,
    alignItems: "center", marginBottom: 8,
  },
  bindButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 24 },
  cancelText: { color: "#666", fontSize: 14 },
  isolationNote: {
    flexDirection: "row", alignItems: "flex-start",
    marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#2A2A3A",
    width: "100%",
  },
  isolationIcon: { fontSize: 14, marginRight: 8, marginTop: 1 },
  isolationText: { fontSize: 11, color: "#666", lineHeight: 16, flex: 1 },
  // WebView
  webviewContainer: { flex: 1, backgroundColor: "#0F0F17" },
  webviewHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1E1E2A",
  },
  webviewClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  webviewCloseText: { fontSize: 20, color: "#fff" },
  webviewTitle: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
