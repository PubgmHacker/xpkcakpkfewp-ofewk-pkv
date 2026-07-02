import SwiftUI

// MARK: - Ambient Background — "Pure Black × Ice Glow"
///
/// Чёрный фон с 2–3 медленно плавающими blur-пятнами низкой интенсивности.
/// Никаких сплошных фиолетовых градиентов — только точечные подсветки
/// (как ambient glow в Apple Music / Rave).
struct AnimatedGradientBackground: View {
    @State private var animate = false

    /// Цветовая схема орбов — можно переопределить для экрана комнаты
    var orbColors: [Color] = [
        Color(hex: 0x6EC1E4),  // ice blue
        Color(hex: 0xFF3D8B),  // neon pink
        Color(hex: 0x22D3EE),  // cyan
    ]

    var body: some View {
        ZStack {
            // ── База: чистый чёрный ───────────────────────────────────
            Color.raveBackground
                .ignoresSafeArea()

            // ── Плавающие blur-пятна (2–3, низкая интенсивность) ─────
            ZStack {
                GlowOrb(
                    color: orbColors[0],
                    size: 360, blur: 100,
                    x: animate ? -60 : -110, y: animate ? -180 : -120,
                    opacity: 0.12
                )

                GlowOrb(
                    color: orbColors[1],
                    size: 300, blur: 110,
                    x: animate ? 100 : 70, y: animate ? 160 : 100,
                    opacity: 0.10
                )

                GlowOrb(
                    color: orbColors.count > 2 ? orbColors[2] : orbColors[0],
                    size: 240, blur: 120,
                    x: animate ? 80 : -80, y: animate ? -40 : 60,
                    opacity: 0.07
                )
            }
            .ignoresSafeArea()
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
    }
}

// MARK: - Glow Orb (одно blur-пятно)
private struct GlowOrb: View {
    let color: Color
    let size: CGFloat
    let blur: CGFloat
    let x: CGFloat
    let y: CGFloat
    let opacity: Double

    var body: some View {
        Circle()
            .fill(color.opacity(opacity))
            .frame(width: size, height: size)
            .blur(radius: blur)
            .offset(x: x, y: y)
    }
}

// MARK: - Liquid Glass Card — v3 (максимально прозрачное стекло)
///
/// Премиальный glass-эффект:
/// • Полупрозрачный blur-фон (без серого!)
/// • Тонкая обводка 0.5pt rgba(255,255,255,0.15)
/// • Верхний блик
/// • Лёгкая тень
struct GlassCard: ViewModifier {
    var cornerRadius: CGFloat = 18
    var opacity: Double = 0.05

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    // Glass-фон — максимально прозрачный
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .fill(Color.white.opacity(opacity))
                    // Блик сверху (highlight reflection)
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(0.10),
                                    Color.clear
                                ],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                }
            )
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                // Тонкая светлая граница 0.5pt
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.18),
                                Color.white.opacity(0.04),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: Color.black.opacity(0.4), radius: 10, y: 4)
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = 18, opacity: Double = 0.05) -> some View {
        modifier(GlassCard(cornerRadius: cornerRadius, opacity: opacity))
    }
}

// MARK: - Premium Button Style — v3
/// Кнопка с градиентом ice→pink + неоновое свечение. Spring-анимация нажатия.
struct PremiumButtonStyle: ButtonStyle {
    var gradient: LinearGradient = Color.raveGradient
    var glowColor: Color = .ravePrimary

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
            .shadow(color: glowColor.opacity(configuration.isPressed ? 0.2 : 0.45), radius: configuration.isPressed ? 6 : 16, y: 6)
    }
}

// MARK: - Service Logo Icon (оригинальные, цветные)
struct ServiceLogoIcon: View {
    let service: VideoService
    var size: CGFloat = 32

    var body: some View {
        switch service {
        case .youtube:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.22)
                    .fill(Color(hex: 0xFF0000))
                    .frame(width: size * 1.35, height: size * 0.95)
                Image(systemName: "play.fill")
                    .font(.system(size: size * 0.4))
                    .foregroundColor(.white)
            }

        case .vk:
            ZStack {
                Circle().fill(Color(hex: 0x0077FF)).frame(width: size * 1.1, height: size * 1.1)
                Text("VK")
                    .font(.system(size: size * 0.4, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
            }

        case .rutube:
            ZStack {
                Circle().fill(Color(hex: 0x000000)).frame(width: size * 1.1, height: size * 1.1)
                Text("Ru")
                    .font(.system(size: size * 0.36, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
            }

        case .netflix:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.18)
                    .fill(Color(hex: 0xE50914))
                    .frame(width: size * 1.1, height: size * 1.1)
                Text("N")
                    .font(.system(size: size * 0.6, weight: .black, design: .rounded))
                    .foregroundColor(.white)
            }

        case .disney:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.18)
                    .fill(Color(hex: 0x113CCF))
                    .frame(width: size * 1.1, height: size * 1.1)
                Text("D+")
                    .font(.system(size: size * 0.38, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
            }

        case .browser:
            Image(systemName: "safari.fill")
                .font(.system(size: size))
                .foregroundColor(Color(hex: 0x6EC1E4))

        case .customURL:
            Image(systemName: "link")
                .font(.system(size: size))
                .foregroundColor(.raveAccent)

        case .kinopoisk:
            ZStack {
                Circle().fill(Color(hex: 0xFF6600)).frame(width: size * 1.1, height: size * 1.1)
                Text("К")
                    .font(.system(size: size * 0.55, weight: .heavy))
                    .foregroundColor(.white)
            }

        case .ivi:
            ZStack {
                Circle().fill(Color(hex: 0xE40000)).frame(width: size * 1.1, height: size * 1.1)
                Text("ivi")
                    .font(.system(size: size * 0.32, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
            }

        case .okko:
            ZStack {
                Circle().fill(Color(hex: 0xFF0033)).frame(width: size * 1.1, height: size * 1.1)
                Text("OK")
                    .font(.system(size: size * 0.38, weight: .heavy))
                    .foregroundColor(.white)
            }

        case .wink:
            ZStack {
                Circle().fill(Color(hex: 0xFF0050)).frame(width: size * 1.1, height: size * 1.1)
                Image(systemName: "eye.fill")
                    .font(.system(size: size * 0.45))
                    .foregroundColor(.white)
            }

        case .start:
            ZStack {
                Circle().fill(Color(hex: 0x7B2CBF)).frame(width: size * 1.1, height: size * 1.1)
                Image(systemName: "play.fill")
                    .font(.system(size: size * 0.4))
                    .foregroundColor(.white)
            }

        case .premier:
            ZStack {
                Circle().fill(Color(hex: 0xEF4444)).frame(width: size * 1.1, height: size * 1.1)
                Image(systemName: "crown.fill")
                    .font(.system(size: size * 0.42))
                    .foregroundColor(.white)
            }

        case .smotrim:
            ZStack {
                Circle().fill(Color(hex: 0x00A0AF)).frame(width: size * 1.1, height: size * 1.1)
                Image(systemName: "tv.fill")
                    .font(.system(size: size * 0.42))
                    .foregroundColor(.white)
            }

        case .kion:
            ZStack {
                Circle().fill(Color(hex: 0xF26B1F)).frame(width: size * 1.1, height: size * 1.1)
                Text("K")
                    .font(.system(size: size * 0.55, weight: .heavy))
                    .foregroundColor(.white)
            }
        }
    }
}
