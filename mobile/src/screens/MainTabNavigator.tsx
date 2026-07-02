import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "./HomeScreen";
import ProfileScreen from "./ProfileScreen";
import MyRoomsScreen from "./MyRoomsScreen";

// ─────────────────────────────────────────────────────────────────────────────
//  MainTabNavigator — нижние вкладки после успешного Auth-Gate
//    • Главная  — визитка, карусели, кнопки действий
//    • Мои комнаты — активные и история
//    • Профиль — настройки, выход
// ─────────────────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  MyRooms: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Иконки эмодзи (не требуют ассетов) с цветом по активной вкладке
function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20 }}>{icon}</Text>;
}

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0F0F17",
          borderTopColor: "#1E1E2A",
          height: 64,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: "#7346EB",
        tabBarInactiveTintColor: "#666",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Главная",
          tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} />,
        }}
      />
      <Tab.Screen
        name="MyRooms"
        component={MyRoomsScreen}
        options={{
          tabBarLabel: "Мои комнаты",
          tabBarIcon: ({ color }) => <TabIcon icon="📺" color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Профиль",
          tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
