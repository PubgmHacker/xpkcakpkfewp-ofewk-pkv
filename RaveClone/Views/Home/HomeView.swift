import SwiftUI

// MARK: - Home View
/// Main screen: list of active rooms, create/join buttons, profile access.
struct HomeView: View {
    @State private var viewModel: HomeViewModel
    @State private var showCreateRoom = false
    @State private var showJoinSheet = false
    @State private var joinCode = ""
    @State private var navigateToRoom: Room?
    var onProfileTap: () -> Void

    init(viewModel: HomeViewModel, onProfileTap: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onProfileTap = onProfileTap
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.raveBackground
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header
                    headerView
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                    // Search
                    searchBar
                        .padding(.horizontal, 20)
                        .padding(.top, 12)

                    // Room list
                    if viewModel.isLoading && viewModel.rooms.isEmpty {
                        loadingView
                    } else if viewModel.filteredRooms.isEmpty {
                        emptyState
                    } else {
                        roomList
                    }

                    Spacer(minLength: 0)
                }
            }
            .navigationDestination(item: $navigateToRoom) { room in
                RoomView(room: room)
            }
            .sheet(isPresented: $showCreateRoom) {
                CreateRoomView { room in
                    showCreateRoom = false
                    navigateToRoom = room
                }
            }
            .sheet(isPresented: $showJoinSheet) {
                joinRoomSheet
            }
            .task {
                await viewModel.loadRooms()
            }
            .refreshable {
                await viewModel.refresh()
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header

    private var headerView: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Rooms")
                    .font(.title.bold())
                    .foregroundColor(.raveTextPrimary)

                Text("\(viewModel.rooms.count) active room\(viewModel.rooms.count == 1 ? "" : "s")")
                    .font(.subheadline)
                    .foregroundColor(.raveTextSecondary)
            }

            Spacer()

            // Join button
            Button {
                showJoinSheet = true
            } label: {
                Image(systemName: "link")
                    .font(.title3)
                    .foregroundColor(.ravePrimary)
                    .frame(width: 44, height: 44)
                    .background(Color.raveCard)
                    .clipShape(Circle())
            }

            // Profile button
            Button {
                onProfileTap()
            } label: {
                Image(systemName: "person.circle.fill")
                    .font(.title3)
                    .foregroundColor(.raveSecondary)
                    .frame(width: 44, height: 44)
                    .background(Color.raveCard)
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.raveTextSecondary)

            TextField("Search rooms...", text: $viewModel.searchText)
                .foregroundColor(.raveTextPrimary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.raveCard)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Room List

    private var roomList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.filteredRooms) { room in
                    Button {
                        navigateToRoom = room
                    } label: {
                        RoomCardView(room: room)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
    }

    // MARK: - Loading State

    private var loadingView: some View {
        VStack(spacing: 20) {
            Spacer()
            ProgressView()
                .tint(.ravePrimary)
                .scaleEffect(1.2)
            Text("Loading rooms...")
                .font(.subheadline)
                .foregroundColor(.raveTextSecondary)
            Spacer()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "tv.badge.wifi")
                .font(.system(size: 50))
                .foregroundColor(.raveSurface)

            if viewModel.searchText.isEmpty {
                Text("No active rooms")
                    .font(.headline)
                    .foregroundColor(.raveTextPrimary)

                Text("Create a room and invite friends!")
                    .font(.subheadline)
                    .foregroundColor(.raveTextSecondary)
            } else {
                Text("No rooms found")
                    .font(.headline)
                    .foregroundColor(.raveTextPrimary)

                Text("Try a different search")
                    .font(.subheadline)
                    .foregroundColor(.raveTextSecondary)
            }

            Spacer()

            // Create room button (FAB)
            Button {
                showCreateRoom = true
            } label: {
                Image(systemName: "plus.bolt")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                    .frame(width: 60, height: 60)
                    .background(.raveGradient)
                    .clipShape(Circle())
                    .shadow(color: .ravePrimary.opacity(0.4), radius: 12, y: 6)
            }
            .padding(.bottom, 24)
        }
    }

    // MARK: - Join Room Sheet

    private var joinRoomSheet: some View {
        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 40))
                    .foregroundGradient(.raveGradient)

                Text("Join a Room")
                    .font(.title2.bold())
                    .foregroundColor(.raveTextPrimary)

                Text("Enter the 6-character room code")
                    .font(.subheadline)
                    .foregroundColor(.raveTextSecondary)
            }

            TextField("ABC123", text: $joinCode)
                .textFieldStyle(RaveTextFieldStyle())
                .multilineTextAlignment(.center)
                .font(.title2.monospaced().bold())
                .padding(.horizontal, 40)
                .autocapitalization(.allCharacters)
                .onChange(of: joinCode) { _, newValue in
                    joinCode = String(newValue.prefix(6)).uppercased()
                }

            Button(action: {
                Task {
                    if joinCode.count == 6 {
                        do {
                            let room = try await viewModel.joinRoom(code: joinCode)
                            showJoinSheet = false
                            navigateToRoom = room
                            joinCode = ""
                        } catch {
                            viewModel.errorMessage = error.localizedDescription
                        }
                    }
                }
            }) {
                Text("Join")
                    .frame(maxWidth: .infinity)
            }
            .raveButtonStyle()
            .padding(.horizontal, 40)
            .disabled(joinCode.count != 6 || viewModel.isLoading)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.raveDanger)
            }

            Button("Cancel") {
                showJoinSheet = false
                joinCode = ""
            }
            .foregroundColor(.raveTextSecondary)

            Spacer()
        }
        .padding(.top, 32)
        .presentationDetents([.medium])
        .presentationBackground(Color.raveBackground)
        .preferredColorScheme(.dark)
    }
}

// MARK: - Navigation Destination Item
extension Room: @retroactive Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    public static func == (lhs: Room, rhs: Room) -> Bool {
        lhs.id == rhs.id
    }
}
