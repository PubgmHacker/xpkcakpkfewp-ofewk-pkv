import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "./HomeScreen";
import ProfileScreen from "./ProfileScreen";

// ─────────────────────────────────────────────────────────────────────────────
//  MainTabNavigator — нижние вкладки после успешного Auth-Gate
// ─────────────────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0F0F17",
          borderTopColor: "#1E1E2A",
        },
        tabBarActiveTintColor: "#7346EB",
        tabBarInactiveTintColor: "#666",
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: "Комнаты", tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: "Профиль", tabBarIcon: () => null }}
      />
    </Tab.Navigator>
  );
}
