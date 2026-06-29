import Foundation

// MARK: - Chat Message
struct ChatMessage: Codable, Identifiable, Sendable {
    let id: String
    let roomID: String
    let senderID: String
    let senderName: String
    let text: String
    let timestamp: Date
    var isRead: Bool

    var timeString: String {
        timestamp.formatted(.dateTime.hour().minute())
    }

    static var preview: ChatMessage {
        ChatMessage(
            id: "msg_001",
            roomID: "room_001",
            senderID: "user_001",
            senderName: "Alex",
            text: "This is awesome! 🎬",
            timestamp: .now.addingTimeInterval(-120),
            isRead: true
        )
    }
}

// MARK: - System Message (join/leave notifications)
struct SystemMessage: Identifiable, Sendable {
    let id = UUID().uuidString
    let roomID: String
    let text: String
    let timestamp: Date

    var timeString: String {
        timestamp.formatted(.dateTime.hour().minute())
    }
}

// MARK: - Chat Payload (WebSocket outbound)
/// Сетевая структура для отправки текстовых сообщений через WebSocket.
/// JSON-схема совпадает с бэкенд-типом `ChatPayload` (server/src/types/index.ts):
///   { type, roomID, senderID, senderName, text }
struct ChatPayload: Codable, Sendable {
    let type: String          // всегда "chat"
    let roomID: String
    let senderID: String
    let senderName: String
    let text: String
}
