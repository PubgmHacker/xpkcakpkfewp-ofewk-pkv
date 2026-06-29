import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

// ─────────────────────────────────────────────────────────────────────────────
//  AnimatedGradientText — текст с анимированным градиентом (перелив цветов)
//
//  Эксклюзивный стиль для роли ADMIN: красный переливающийся градиент.
//  Градиент плавно «течёт» по горизонтали за счёт анимации положения.
//
//  Используется в:
//    • ChatView.tsx — никнейм админа в сообщениях
//    • ParticipantList — никнейм админа в списке участников
//    • FullscreenRoomView — оверлей информации о говорящем
//
//  Зависимости: expo-linear-gradient, @react-native-masked-view/masked-view
// ─────────────────────────────────────────────────────────────────────────────

interface AnimatedGradientTextProps {
  text: string;
  /** Предустановленные цветовые палитры. */
  variant?: "adminRed" | "founderGold" | "premiumPurple";
  style?: ViewStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
}

const PALETTES: Record<
  NonNullable<AnimatedGradientTextProps["variant"]>,
  { colors: string[] }
> = {
  // ─── Админ: красно-оранжевый перелив (фирменный) ────────────────────────
  adminRed: {
    colors: ["#FF1744", "#FF6B6B", "#FFA500", "#FF1744", "#FF6B6B", "#FF1744"],
  },
  // ─── Основатель: золотой перелив ─────────────────────────────────────────
  founderGold: {
    colors: ["#FFD700", "#FFA500", "#FFEC8B", "#FFD700", "#FFA500", "#FFD700"],
  },
  // ─── Премиум: фиолетово-розовый перелив ──────────────────────────────────
  premiumPurple: {
    colors: ["#7346EB", "#B83FFC", "#FF4DCC", "#7346EB", "#B83FFC", "#7346EB"],
  },
};

export default function AnimatedGradientText({
  text,
  variant = "adminRed",
  style,
  fontSize = 14,
  fontWeight = "bold",
}: AnimatedGradientTextProps) {
  // Позиция градиента: 0 → 1, зацикленная анимация
  const translateX = useRef(new Animated.Value(0)).current;
  const textWidth = text.length * fontSize * 0.65; // приблизительная ширина

  useEffect(() => {
    // Градиент шире текста в 2 раза → движение от 0 до -textWidth (зацикленно)
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -textWidth,
        duration: 2500,
        useNativeDriver: true,
        easing: (t) => t, // linear
      })
    );
    loop.start();
    return () => loop.stop();
  }, [translateX, textWidth]);

  const palette = PALETTES[variant];

  return (
    <MaskedView
      style={[styles.container, style]}
      maskElement={
        <Animated.Text
          style={[styles.text, { fontSize, fontWeight }]}
        >
          {text}
        </Animated.Text>
      }
    >
      <Animated.View
        style={{
          width: textWidth * 2,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={palette.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: textWidth * 2, height: fontSize * 1.5 }}
        />
      </Animated.View>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
  },
  text: {
    color: "#000", // будет замаскирован градиентом
    textAlign: "center",
  },
});
