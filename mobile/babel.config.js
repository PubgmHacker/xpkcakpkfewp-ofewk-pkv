module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Reanimated 2 — должен быть последним в массиве
      "react-native-reanimated/plugin",
    ],
  };
};
