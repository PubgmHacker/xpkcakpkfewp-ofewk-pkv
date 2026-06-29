import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuthStore } from "./store/authStore";
import AppAuthScreen from "./screens/AppAuthScreen";
import MainTabNavigator from "./screens/MainTabNavigator";
import RoomScreen from "./screens/RoomScreen";
import type { Room } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
//  AppNavigator — корневой навигатор с Auth-Gate
//
//  ┌─ Auth-Gate (Уровень 1: App Auth) ────────────────────────────────────┐
//  │                                                                       │
//  │  AsyncStorage нет JWT?  ──→  AppAuthScreen (жёстко, нельзя пропустить) │
//  │          │                                                            │
//  │          ▼ (после успешного входа → setAuth)                          │
//  │  JWT есть?              ──→  MainTabNavigator (Home + Profile)        │
//  │                                       │                               │
//  │                                       ▼                               │
//  │                                 RoomScreen (детализация комнаты)      │
//  │                                       │                               │
//  │                                       ▼                               │
//  │                          RoomPlayer → DrmSessionManager (Уровень 2)  │
//  │                          ← изолированная DRM-авторизация              │
//  └───────────────────────────────────────────────────────────────────────┘
//
//  ⚠️ Важно: DRM-сессии (Кинопоиск/Netflix) НЕ влияют на этот гейт.
//  Пользователь может быть залогинен в RaveClone, но не залогинен в Кинопоиске —
//  тогда DrmOverlay попросит привязать аккаунт уже внутри RoomPlayer.
// ─────────────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Room: { room: Room };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isLoading, isAuthenticated, hydrate } = useAuthStore();

  // Восстанавливаем JWT из AsyncStorage при первом рендере
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // ─── Splash / загрузка ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#7346EB" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#0F0F17" },
          headerTintColor: "#fff",
          contentStyle: { backgroundColor: "#0F0F17" },
        }}
      >
        {/* ─── Auth-Gate ─── */}
        {!isAuthenticated ? (
          <Stack.Screen
            name="Auth"
            component={AppAuthScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            {/* ─── Главная (Tabs: Home + Profile) ─── */}
            <Stack.Screen
              name="Main"
              component={MainTabNavigator}
              options={{ headerShown: false }}
            />
            {/* ─── Комната ─── */}
            <Stack.Screen
              name="Room"
              component={RoomScreen}
              options={{ title: "Комната", headerBackTitle: "Назад" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#0F0F17",
    alignItems: "center",
    justifyContent: "center",
  },
});
