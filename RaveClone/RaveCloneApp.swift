import SwiftUI

// MARK: - App Entry Point
/// Configures dependency injection, wires JWT token flow between services,
/// and manages the root navigation + WebSocket lifecycle.
@main
struct RaveCloneApp: App {

    // MARK: - Service Singletons (app lifetime)

    private let apiClient = APIClient()
    private lazy var authService = AuthService(api: apiClient)
    private lazy var mediaService = MediaService()
    private lazy var wsClient = WebSocketClient()
    private lazy var roomService = RoomService(api: apiClient)

    // MARK: - State

    @State private var isSignedIn = false
    @State private var showProfile = false

    // MARK: - Init

    init() {
        // Bridge auth token into MediaService so authenticated extraction works.
        // (AuthService already propagates the token into apiClient on init/refresh.)
    }

    // MARK: - Root View

    var body: some Scene {
        WindowGroup {
            Group {
                if isSignedIn {
                    authenticatedContent
                } else {
                    loginContent
                }
            }
            .animation(.easeInOut(duration: 0.3), value: isSignedIn)
            .onAppear {
                bridgeAuthToken()
                checkAuth()
            }
        }
    }

    // MARK: - Authenticated Content

    @ViewBuilder
    private var authenticatedContent: some View {
        HomeView(
            viewModel: HomeViewModel(
                roomService: roomService,
                authService: authService
            ),
            onProfileTap: { showProfile = true }
        )
        .fullScreenCover(isPresented: $showProfile) {
            NavigationStack {
                ProfileView(
                    viewModel: ProfileViewModel(authService: authService),
                    onSignOut: {
                        Task { await authService.signOut() }
                        showProfile = false
                        isSignedIn = false
                    }
                )
            }
            .preferredColorScheme(.dark)
        }
    }

    // MARK: - Login Content

    @ViewBuilder
    private var loginContent: some View {
        NavigationStack {
            LoginView(
                viewModel: AuthViewModel(authService: authService),
                onSignIn: {
                    bridgeAuthToken()   // push JWT to WS + MediaService before entering
                    isSignedIn = true
                }
            )
        }
    }

    // MARK: - Token Bridge

    /// Propagate the current JWT from AuthService into every service that needs it:
    /// - WebSocketClient (sends as ?token= + Authorization header)
    /// - MediaService (Authorization: Bearer on extraction calls)
    /// APIClient is already updated inside AuthService.
    private func bridgeAuthToken() {
        Task {
            let token = await authService.getFreshToken()
            await MainActor.run {
                wsClient.setAuthToken(token)
                mediaService.setAuthToken(token)
            }
        }
    }

    // MARK: - Auth Check

    private func checkAuth() {
        Task {
            if await authService.currentUser() != nil {
                bridgeAuthToken()
                await MainActor.run { isSignedIn = true }
            }
        }
    }
}
