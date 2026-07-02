import SwiftUI

// MARK: - RaveClone v3 Theme — "Pure Black × Ice Glow"
///
/// Принципы:
/// • Базовый фон — настоящий чёрный (#000000 / #050507), не серый, не фиолетовый.
/// • Акценты — ледяной голубой (#6EC1E4), неоново-розовый (#FF3D8B), золото (#E8B339).
///   Фиолетовый полностью убран из основных цветов.
/// • Контраст — за счёт чистого белого текста и точечных подсветок (blur-orbs).
/// • Стекло — максимально прозрачное: blur + тонкая обводка 0.5pt rgba(255,255,255,0.15).
extension Color {
    // ── Accents ──────────────────────────────────────────────────────
    /// Ледяной голубой — основной акцент (CTA, активные элементы)
    static let ravePrimary = Color(hex: 0x6EC1E4)
    /// Электрик-синий — вторичный
    static let raveSecondary = Color(hex: 0x3D8DE0)
    /// Неоново-розовый — live-индикатор, эмоции
    static let raveAccent = Color(hex: 0xFF3D8B)
    /// Светящийся cyan (highlights, glow)
    static let raveCyan = Color(hex: 0x22D3EE)
    /// Изумрудный — live-статус (онлайн)
    static let raveGreen = Color(hex: 0x00E676)
    /// Золото — premium
    static let raveWarning = Color(hex: 0xE8B339)
    /// Красный — danger / mute
    static let raveDanger = Color(hex: 0xFF4757)

    // ── Backgrounds — TRUE BLACK ─────────────────────────────────────
    /// Основной фон приложения — почти чёрный (лёгкий синий оттенок для глубины)
    static let raveBackground = Color(hex: 0x000000)
    /// Фон карточек — чисто чёрный с микро-прозрачностью
    static let raveCard = Color(hex: 0x0A0A0A)
    /// Границы / surfaces
    static let raveSurface = Color(hex: 0x141414)

    // ── Text ─────────────────────────────────────────────────────────
    static let raveTextPrimary = Color.white
    static let raveTextSecondary = Color(white: 0.62)
    static let raveTextTertiary = Color(white: 0.38)

    // ── Glass ────────────────────────────────────────────────────────
    static let raveGlass = Color.white.opacity(0.05)

    // ── Gradients ────────────────────────────────────────────────────
    /// Главный градиент CTA: ледяной голубой → розовый
    static let raveGradient = LinearGradient(
        colors: [Color(hex: 0x6EC1E4), Color(hex: 0xFF3D8B)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Двухцветный акцент для заголовков: голубой → cyan
    static let raveTriGradient = LinearGradient(
        colors: [Color(hex: 0x6EC1E4), Color(hex: 0x22D3EE)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Glow градиент (свечение, hover)
    static let raveGlowGradient = LinearGradient(
        colors: [Color(hex: 0x6EC1E4), Color(hex: 0xFF3D8B)],
        startPoint: .leading,
        endPoint: .trailing
    )

    /// Фоновый градиент — глубокий чёрный с микро-синим
    static let raveBgGradient = LinearGradient(
        colors: [Color(hex: 0x000000), Color(hex: 0x050810), Color(hex: 0x000000)],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Hex
extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

// MARK: - Glow Helpers
extension Color {
    var glowShadow: Color { self.opacity(0.5) }
}

extension View {
    func neonGlow(color: Color = .ravePrimary, radius: CGFloat = 16, y: CGFloat = 6) -> some View {
        self.shadow(color: color.glowShadow, radius: radius, x: 0, y: y)
    }

    func chatTextShadow() -> some View {
        self.shadow(color: .black.opacity(0.9), radius: 2.5, x: 0, y: 1)
    }
}
