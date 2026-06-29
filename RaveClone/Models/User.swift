import Foundation

// MARK: - User Model
struct User: Codable, Identifiable, Sendable {
    let id: String
    let username: String
    let email: String
    let avatarURL: String?
    let isOnline: Bool
    let createdAt: Date

    var initials: String {
        String(username.prefix(2).uppercased())
    }

    var displayName: String {
        username
    }

    static var preview: User {
        User(
            id: "user_001",
            username: "Alex",
            email: "alex@example.com",
            avatarURL: nil,
            isOnline: true,
            createdAt: Date()
        )
    }
}

// MARK: - Minimal User (for room participants list)
struct UserPreview: Codable, Identifiable, Sendable {
    let id: String
    let username: String
    let avatarURL: String?
    let isOnline: Bool

    static var preview: UserPreview {
        UserPreview(id: "user_002", username: "Jordan", avatarURL: nil, isOnline: true)
    }
}
