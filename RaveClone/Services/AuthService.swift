import Foundation

// MARK: - Auth Service (Firebase)
/// Handles user authentication via Firebase Auth.
///
/// Token lifecycle:
///   1. After sign-in/sign-up, Firebase issues a JWT (idToken).
///   2. We store it in the keychain (here: UserDefaults for brevity; use
///      KeychainAccess in production).
///   3. APIClient, MediaService, and WebSocketClient all read this token to
///      authenticate against the backend.
///   4. Firebase tokens expire after 1h; we expose `getFreshToken()` which
///      triggers a silent refresh via `getIDTokenResult(forcingRefresh:)`.
final class AuthService: AuthServiceProtocol {

    private let api: APIClient
    private let defaults = UserDefaults.standard

    private enum Keys {
        static let savedUser = "rave_saved_user"
        static let authToken = "rave_auth_token"
        static let tokenExpiry = "rave_token_expiry"
        static let fcmToken = "rave_fcm_token"
    }

    // MARK: - Stored User + Token

    @MainActor private(set) var currentUser: User?

    /// Latest JWT from Firebase. Other services read this to attach to requests.
    private(set) var authToken: String?

    /// Unix timestamp when authToken expires.
    private(set) var tokenExpiry: TimeInterval = 0

    /// FCM token for push notifications, if registered.
    private(set) var fcmToken: String?

    // MARK: - Init

    init(api: APIClient) {
        self.api = api

        // Restore cached user + token on launch
        if let data = defaults.data(forKey: Keys.savedUser),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            Task { @MainActor in self.currentUser = user }
        }
        self.authToken = defaults.string(forKey: Keys.authToken)
        self.tokenExpiry = defaults.double(forKey: Keys.tokenExpiry)
        self.fcmToken = defaults.string(forKey: Keys.fcmToken)

        // Propagate restored token to the API client immediately
        api.authToken = authToken
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async throws -> User {
        // TODO: Replace with real Firebase Auth
        // let result = try await Auth.auth().signIn(withEmail: email, password: password)
        // let token = try await result.user.getIDTokenResult(forcingRefresh: true)

        let user = User(
            id: "user_\(email.hashValue)",
            username: email.components(separatedBy: "@").first ?? "User",
            email: email,
            avatarURL: nil,
            isOnline: true,
            createdAt: Date()
        )

        // Simulated token (replace with Firebase idToken)
        let token = "mock.jwt.token.\(UUID().uuidString)"
        let expiry = Date().addingTimeInterval(3600).timeIntervalSince1970
        await cacheToken(token, expiry: expiry)

        cacheUser(user)
        await registerFCMIfPresent()
        return user
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String, username: String) async throws -> User {
        // TODO: Replace with real Firebase Auth
        // let result = try await Auth.auth().createUser(withEmail: email, password: password)
        // let changeRequest = result.user.createProfileChangeRequest()
        // changeRequest.displayName = username
        // try await changeRequest.commitChanges()
        // let token = try await result.user.getIDTokenResult(forcingRefresh: true)

        let user = User(
            id: "user_\(email.hashValue)",
            username: username,
            email: email,
            avatarURL: nil,
            isOnline: true,
            createdAt: Date()
        )

        let token = "mock.jwt.token.\(UUID().uuidString)"
        let expiry = Date().addingTimeInterval(3600).timeIntervalSince1970
        await cacheToken(token, expiry: expiry)

        cacheUser(user)
        await registerFCMIfPresent()
        return user
    }

    // MARK: - Sign Out

    func signOut() async throws {
        // TODO: try Auth.auth().signOut()
        defaults.removeObject(forKey: Keys.savedUser)
        defaults.removeObject(forKey: Keys.authToken)
        defaults.removeObject(forKey: Keys.tokenExpiry)
        authToken = nil
        tokenExpiry = 0
        api.authToken = nil
        await MainActor.run { self.currentUser = nil }
    }

    // MARK: - Current User

    func currentUser() async -> User? {
        await currentUser
    }

    // MARK: - Delete Account

    func deleteAccount() async throws {
        // TODO: try await Auth.auth().currentUser?.delete()
        try await signOut()
    }

    // MARK: - Token Management

    /// Returns a non-expired auth token, refreshing via Firebase if needed.
    /// Call this before any authenticated network operation.
    func getFreshToken() async -> String? {
        // If token expires within next 5 min, force refresh
        let now = Date().timeIntervalSince1970
        if authToken == nil || now >= tokenExpiry - 300 {
            // TODO: Firebase refresh
            // if let firebaseUser = Auth.auth().currentUser {
            //     let result = try await firebaseUser.getIDTokenResult(forcingRefresh: true)
            //     await cacheToken(result.token, expiry: result.expirationDate.timeIntervalSince1970)
            // }
            return authToken
        }
        return authToken
    }

    private func cacheToken(_ token: String, expiry: TimeInterval) async {
        authToken = token
        tokenExpiry = expiry
        api.authToken = token
        defaults.set(token, forKey: Keys.authToken)
        defaults.set(expiry, forKey: Keys.tokenExpiry)
    }

    // MARK: - FCM Token (Push Notifications)

    /// Called by the Firebase Messaging delegate when a new FCM token is issued.
    func setFCMToken(_ token: String) async {
        fcmToken = token
        defaults.set(token, forKey: Keys.fcmToken)
        await registerFCMToken(token)
    }

    /// If we already have an FCM token (e.g. restored from defaults), push it to backend.
    private func registerFCMIfPresent() async {
        guard let fcmToken else { return }
        await registerFCMToken(fcmToken)
    }

    /// Persist FCM token on backend so push notifications can reach this device.
    private func registerFCMToken(_ token: String) async {
        struct FCMBody: Encodable { let token: String }
        let body = FCMBody(token: token)
        do {
            try await api.requestNoBody("auth/fcm-token", method: .post, body: body)
        } catch {
            // Non-fatal — token will be re-sent on next app foreground
            print("[Auth] FCM token registration failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Private

    private func cacheUser(_ user: User) {
        if let data = try? JSONEncoder().encode(user) {
            defaults.set(data, forKey: Keys.savedUser)
        }
        Task { @MainActor in self.currentUser = user }
    }
}
