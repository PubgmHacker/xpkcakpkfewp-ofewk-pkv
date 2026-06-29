import Foundation

// MARK: - Room Model
struct Room: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let hostID: String
    let hostName: String
    let code: String               // 6-char shareable code
    var participants: [UserPreview]
    let mediaItem: MediaItem?
    let isActive: Bool
    let maxParticipants: Int
    let createdAt: Date

    var participantCount: Int {
        participants.count
    }

    var isFull: Bool {
        participants.count >= maxParticipants
    }

    var isHost: Bool {
        // Set at runtime by ViewModel based on current user
        false
    }

    var formattedDate: String {
        createdAt.formatted(.dateTime.month().day().hour().minute())
    }

    static var preview: Room {
        Room(
            id: "room_001",
            name: "Movie Night 🍿",
            hostID: "user_001",
            hostName: "Alex",
            code: "ABC123",
            participants: [
                UserPreview(id: "user_001", username: "Alex", avatarURL: nil, isOnline: true),
                UserPreview(id: "user_002", username: "Jordan", avatarURL: nil, isOnline: true),
                UserPreview(id: "user_003", username: "Sam", avatarURL: nil, isOnline: false),
            ],
            mediaItem: MediaItem.preview,
            isActive: true,
            maxParticipants: 10,
            createdAt: .now.addingTimeInterval(-3600)
        )
    }

    enum CodingKeys: String, CodingKey {
        case id, name, hostID, hostName, code
        case participants, mediaItem, isActive
        case maxParticipants, createdAt
    }
}

// MARK: - Create Room Request
struct CreateRoomRequest: Codable, Sendable {
    let name: String
    let maxParticipants: Int
    let mediaItem: MediaItem?
}

// MARK: - Join Room Request
struct JoinRoomRequest: Codable, Sendable {
    let code: String
}
