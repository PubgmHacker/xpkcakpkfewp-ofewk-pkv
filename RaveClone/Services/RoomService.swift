import Foundation

// MARK: - Room Service
/// Manages room CRUD operations via REST API.
final class RoomService: RoomServiceProtocol {

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Create Room

    func createRoom(_ request: CreateRoomRequest) async throws -> Room {
        try await api.request("rooms", method: .post, body: request)
    }

    // MARK: - Join Room

    func joinRoom(code: String) async throws -> Room {
        let request = JoinRoomRequest(code: code)
        return try await api.request("rooms/join", method: .post, body: request)
    }

    // MARK: - Leave Room

    func leaveRoom(roomID: String) async throws {
        try await api.requestNoBody("rooms/\(roomID)/leave", method: .post)
    }

    // MARK: - Fetch Active Rooms

    func fetchActiveRooms() async throws -> [Room] {
        try await api.request("rooms", method: .get)
    }

    // MARK: - Fetch Single Room

    func fetchRoom(id: String) async throws -> Room {
        try await api.request("rooms/\(id)")
    }

    // MARK: - Delete Room

    func deleteRoom(roomID: String) async throws {
        try await api.requestNoBody("rooms/\(roomID)", method: .delete)
    }
}
