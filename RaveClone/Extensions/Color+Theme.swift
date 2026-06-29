import SwiftUI

// MARK: - App Theme Colors
extension Color {
    // Primary palette — dark streaming vibe
    static let ravePrimary = Color(red: 0.45, green: 0.27, blue: 0.92)      // Deep purple
    static let raveSecondary = Color(red: 0.24, green: 0.47, blue: 0.96)     // Electric blue
    static let raveAccent = Color(red: 1.0, green: 0.36, blue: 0.52)        // Hot pink
    static let raveGreen = Color(red: 0.29, green: 0.87, blue: 0.54)        // Success green
    static let raveWarning = Color(red: 1.0, green: 0.78, blue: 0.27)       // Warning yellow
    static let raveDanger = Color(red: 1.0, green: 0.27, blue: 0.27)        // Error red

    // Backgrounds
    static let raveBackground = Color(red: 0.07, green: 0.07, blue: 0.11)
    static let raveCard = Color(red: 0.12, green: 0.12, blue: 0.18)
    static let raveSurface = Color(red: 0.18, green: 0.18, blue: 0.26)

    // Text
    static let raveTextPrimary = Color.white
    static let raveTextSecondary = Color(white: 0.65)

    // Gradients
    static let raveGradient = LinearGradient(
        colors: [.ravePrimary, .raveSecondary],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let raveAccentGradient = LinearGradient(
        colors: [.raveAccent, .ravePrimary],
        startPoint: .leading,
        endPoint: .trailing
    )
}
