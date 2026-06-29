import Foundation

// MARK: - Home View Model
@Observable
final class HomeViewModel {

    // MARK: - State

    var rooms: [Room] = []
    var isLoading = false
    var errorMessage: String?
    var showCreateRoom = false
    var showJoinRoom = false
    var searchText = ""
    var selectedRoom: Room?

    var filteredRooms: [Room] {
        if searchText.isEmpty {
            return rooms
        }
        return rooms.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.hostName.localizedCaseInsensitiveContains(searchText)
        }
    }

    // MARK: - Services

    private let roomService: RoomServiceProtocol
    private let authService: AuthServiceProtocol

    // MARK: - Init

    init(roomService: RoomServiceProtocol, authService: AuthServiceProtocol) {
        self.roomService = roomService
        self.authService = authService
    }

    // MARK: - Actions

    func loadRooms() async {
        isLoading = true
        errorMessage = nil

        do {
            rooms = try await roomService.fetchActiveRooms()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func createRoom(name: String, maxParticipants: Int, mediaItem: MediaItem?) async throws -> Room {
        let request = CreateRoomRequest(
            name: name,
            maxParticipants: maxParticipants,
            mediaItem: mediaItem
        )
        let room = try await roomService.createRoom(request)
        rooms.insert(room, at: 0)
        return room
    }

    func joinRoom(code: String) async throws -> Room {
        let room = try await roomService.joinRoom(code: code)
        rooms.insert(room, at: 0)
        return room
    }

    func refresh() async {
        await loadRooms()
    }
}
