import Foundation

// MARK: - Profile View Model
@Observable
final class ProfileViewModel {

    // MARK: - State

    var user: User?
    var isLoading = false
    var errorMessage: String?

    var displayName: String {
        user?.displayName ?? "Unknown"
    }

    var email: String {
        user?.email ?? ""
    }

    var username: String {
        user?.username ?? ""
    }

    // MARK: - Services

    private let authService: AuthServiceProtocol

    // MARK: - Init

    init(authService: AuthServiceProtocol) {
        self.authService = authService
    }

    func loadUser() async {
        isLoading = true
        user = await authService.currentUser()
        isLoading = false
    }

    func updateUsername(_ newName: String) async {
        // TODO: Update via API
        user?.username = newName
    }

    func deleteAccount() async {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.deleteAccount()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
