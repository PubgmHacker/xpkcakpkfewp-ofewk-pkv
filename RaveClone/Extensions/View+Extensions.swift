import SwiftUI

// MARK: - View Extensions

extension View {
    /// Shimmer loading placeholder
    func shimmer(_ active: Bool = true) -> some View {
        modifier(ShimmerModifier(active: active))
    }

    /// Card-style background
    func raveCardStyle() -> some View {
        self
            .padding()
            .background(Color.raveCard)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.raveSurface, lineWidth: 1)
            )
    }

    /// Primary button style
    func raveButtonStyle() -> some View {
        self
            .font(.headline)
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(.raveGradient)
            .clipShape(Capsule())
    }

    /// Secondary button style
    func raveSecondaryButtonStyle() -> some View {
        self
            .font(.headline)
            .foregroundColor(.ravePrimary)
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Color.raveCard)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.ravePrimary, lineWidth: 1.5)
            )
    }

    /// Conditionally apply modifier
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - Shimmer Modifier
struct ShimmerModifier: ViewModifier {
    let active: Bool

    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        if active {
            content
                .redacted(reason: .placeholder)
                .overlay(
                    GeometryReader { geo in
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.15), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: phase * geo.size.width * 1.5 - geo.size.width * 0.25)
                    }
                    .clipped()
                )
                .onAppear {
                    withAnimation(
                        .linear(duration: 1.5)
                        .repeatForever(autoreverses: false)
                    ) {
                        phase = 1
                    }
                }
        } else {
            content
        }
    }
}
