// ═══════════════════════════════════════════════════════════════════════════
//  Metro Configuration
//
//  Перенаправляет react-native-webrtc на mock в Expo Go.
//  Реальный WebRTC требует EAS Build (нативный модуль C++).
//  Мок позволяет запускать всё остальное (видео, чат, синхро, авторизацию).
// ═══════════════════════════════════════════════════════════════════════════

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Перенаправляем react-native-webrtc на mock (для Expo Go)
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "react-native-webrtc": `${__dirname}/src/services/__mocks__/react-native-webrtc.js`,
};

module.exports = config;
