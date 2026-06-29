import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import AppNavigator from "./src/AppNavigator";
import { useAuthStore } from "./src/store/authStore";
import { DrmSessionManager } from "./src/services/DrmSessionManager";

// ═══════════════════════════════════════════════════════════════════════════
//  App.tsx — корневой компонент Expo
//
//  Оборачивает навигатор в необходимые провайдеры:
//    • GestureHandlerRootView — жесты (свайпы чата, плеер)
//    • SafeAreaProvider       — безопасные зоны (notch, home indicator)
//    • StatusBar              — тёмная тема статус-бара
//
//  При старте:
//    1. Восстанавливает app-auth из AsyncStorage (useAuthStore.hydrate)
//    2. Восстанавливает изолированные DRM-сессии (DrmSessionManager.hydrate)
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    // 1. Восстановление JWT RaveClone
    hydrate();
    // 2. Восстановление изолированных DRM-сессий (Кинопоиск/Netflix)
    DrmSessionManager.hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
