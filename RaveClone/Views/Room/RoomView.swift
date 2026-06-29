import SwiftUI
import AVKit

// MARK: - Room View
/// The core viewing experience: video player, transport controls, participants,
/// voice chat toggle, text chat, and sync status indicator.
struct RoomView: View {
    let room: Room

    @State private var viewModel: RoomViewModel?
    @State private var showChat = false
    @State private var showParticipants = false
    @State private var seekValue: Double = 0
    @State private var showMediaPlayer = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.raveBackground.ignoresSafeArea()

            if let viewModel {
                VStack(spacing: 0) {
                    // Top bar: room name, sync indicator, controls
                    roomTopBar(viewModel: viewModel)

                    // Video Player / Media Area
                    mediaPlayerArea(viewModel: viewModel)

                    // Transport controls
                    transportControls(viewModel: viewModel)

                    // Bottom bar: voice chat, chat, participants
                    bottomBar(viewModel: viewModel)
                }
                .sheet(isPresented: $showChat) {
                    ChatView(messages: viewModel.messages, chatText: $viewModel.chatText, onSend: viewModel.sendMessage)
                        .presentationDetents([.medium, .large])
                        .presentationBackground(Color.raveBackground)
                        .preferredColorScheme(.dark)
                }
                .sheet(isPresented: $showParticipants) {
                    ParticipantListView(room: viewModel.room)
                        .presentationDetents([.medium])
                        .presentationBackground(Color.raveBackground)
                        .preferredColorScheme(.dark)
                }
            } else {
                ProgressView("Joining room...")
                    .tint(.ravePrimary)
                    .onAppear { setupViewModel() }
            }
        }
        // Запуск сессии: WS connect → voice mesh start. Безопасный async-вход.
        .task {
            guard let viewModel else { return }
            await viewModel.joinRoomFlow()
        }
        // Очистка ресурсов при закрытии экрана (mesh teardown, AVAudioSession, REST leave).
        .onDisappear {
            guard let viewModel else { return }
            Task { await viewModel.cleanupFlow() }
        }
        .navigationBarBackButtonHidden()
        .preferredColorScheme(.dark)
    }

    // MARK: - Setup (DI)

    private func setupViewModel() {
        // Сервисы создаются на сессию комнаты. Per-session instance изолирует
        // состояние комнаты и исключает утечку WS между комнатами.
        let api = APIClient()
        let wsClient = WebSocketClient()
        let roomService = RoomService(api: api)
        let authService = AuthService(api: api)
        let mediaService = MediaService()

        let signaling = SignalingClient(ws: wsClient)
        let voiceChat = VoiceChatService(
            signaling: signaling,
            localPeerId: "current_user"   // TODO: брать из authService.currentUser
        )

        let syncEngine = SyncEngine(
            wsClient: wsClient,
            roomID: room.id,
            userID: "current_user",
            isHost: room.hostID == "current_user"
        )

        viewModel = RoomViewModel(
            room: room,
            currentUserId: "current_user",
            wsClient: wsClient,
            roomService: roomService,
            authService: authService,
            syncEngine: syncEngine,
            voiceChat: voiceChat
        )
    }

    // MARK: - Top Bar

    @ViewBuilder
    private func roomTopBar(viewModel: RoomViewModel) -> some View {
        HStack(spacing: 12) {
            // Leave button
            Button {
                Task { await viewModel.cleanupFlow() }
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .foregroundColor(.raveTextPrimary)
                    .frame(width: 36, height: 36)
                    .background(Color.raveCard)
                    .clipShape(Circle())
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.room.name)
                    .font(.subheadline.bold())
                    .foregroundColor(.raveTextPrimary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text("Code: \(viewModel.room.code)")
                        .font(.caption2.monospaced())
                        .foregroundColor(.raveTextSecondary)

                    // Connection status dot
                    connectionDot(viewModel.connectionStatus)

                    // RTT badge — surfaces the latency compensation telemetry
                    if viewModel.syncEngine.estimatedRTTms > 0 {
                        Text("\(viewModel.syncEngine.estimatedRTTms)ms")
                            .font(.caption2.monospacedDigit())
                            .foregroundColor(.raveTextSecondary.opacity(0.7))
                    }
                }
            }

            Spacer()

            // Sync quality indicator
            syncIndicator(viewModel.syncEngine.syncQuality)

            // Participants button
            Button {
                showParticipants = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "person.2")
                        .font(.caption)
                    Text("\(viewModel.room.participantCount)")
                        .font(.caption.bold().monospacedDigit())
                }
                .foregroundColor(.raveTextPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.raveCard)
                .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Sync Indicator

    @ViewBuilder
    private func syncIndicator(_ quality: SyncQuality) -> some View {
        HStack(spacing: 4) {
            Image(systemName: quality.icon)
                .font(.caption2)
            Text(quality.rawValue.capitalized)
                .font(.caption2.bold())
        }
        .foregroundColor(colorForSyncQuality(quality))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.raveCard)
        .clipShape(Capsule())
        .animation(.easeInOut(duration: 0.3), value: quality)
    }

    private func colorForSyncQuality(_ quality: SyncQuality) -> Color {
        switch quality {
        case .perfect: return .raveGreen
        case .good: return .raveWarning
        case .syncing: return .orange
        case .poor: return .raveDanger
        }
    }

    @ViewBuilder
    private func connectionDot(_ status: RoomViewModel.ConnectionStatus) -> some View {
        let (color, label): (Color, String) = {
            switch status {
            case .connected: return (.raveGreen, "")
            case .connecting: return (.raveWarning, "")
            case .reconnecting: return (.raveWarning, "↻")
            case .disconnected: return (.raveDanger, "")
            }
        }()

        HStack(spacing: 2) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
                .overlay(
                    Circle()
                        .fill(color.opacity(0.4))
                        .frame(width: 6, height: 6)
                        .scaleEffect(status == .connecting || status == .reconnecting ? 1.6 : 1)
                        .animation(
                            .easeInOut(duration: 0.8).repeatForever(
                                autoreverses: status == .connecting || status == .reconnecting
                            ),
                            value: status
                        )
                )
            if !label.isEmpty {
                Text(label)
                    .font(.caption2)
                    .foregroundColor(color)
            }
        }
    }

    // MARK: - Media Player Area

    @ViewBuilder
    private func mediaPlayerArea(viewModel: RoomViewModel) -> some View {
        ZStack {
            if let mediaItem = viewModel.syncEngine.currentMediaItem {
                // AVPlayerViewController wrapped in UIViewRepresentable would go here
                // For SwiftUI demonstration, we show a placeholder with controls

                AsyncImage(url: URL(string: mediaItem.thumbnailURL ?? "")) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .clipped()
                    default:
                        mediaPlaceholder(viewModel: viewModel)
                    }
                }

                // Loading overlay
                if viewModel.syncEngine.isLoadingMedia {
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(1.5)
                        Text("Loading...")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.opacity(0.5))
                }

                // Tap to play/pause overlay
                if !viewModel.syncEngine.isLoadingMedia {
                    Button {
                        viewModel.syncEngine.togglePlayPause()
                    } label: {
                        Image(systemName: viewModel.syncEngine.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.white.opacity(0.8))
                            .padding(20)
                            .background(Circle().fill(Color.black.opacity(0.3)))
                    }
                }

                // Media title overlay
                VStack {
                    Spacer()
                    if let mediaItem = viewModel.syncEngine.currentMediaItem {
                        VStack(spacing: 4) {
                            Text(mediaItem.displayTitle)
                                .font(.headline)
                                .foregroundColor(.white)
                            if let duration = mediaItem.formattedDuration {
                                Text(duration)
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.7))
                            }
                        }
                        .padding(.bottom, 8)
                        .padding(.horizontal, 12)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.bottom, 8)
            } else {
                mediaPlaceholder(viewModel: viewModel)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 280)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 0))
    }

    @ViewBuilder
    private func mediaPlaceholder(viewModel: RoomViewModel) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 40))
                .foregroundColor(.raveTextSecondary)

            Text("No media playing")
                .font(.headline)
                .foregroundColor(.raveTextSecondary)

            Text("Add a URL to start watching together")
                .font(.caption)
                .foregroundColor(.raveTextSecondary.opacity(0.7))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.raveCard)
    }

    // MARK: - Transport Controls

    @ViewBuilder
    private func transportControls(viewModel: RoomViewModel) -> some View {
        VStack(spacing: 10) {
            // Time slider
            VStack(spacing: 4) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.raveSurface)
                            .frame(height: 4)
                            .clipShape(Capsule())

                        Rectangle()
                            .fill(.raveGradient)
                            .frame(width: geo.size.width * progress(viewModel), height: 4)
                            .clipShape(Capsule())

                        // Scrubber thumb
                        Circle()
                            .fill(Color.white)
                            .frame(width: 14, height: 14)
                            .offset(x: geo.size.width * progress(viewModel) - 7)
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let ratio = min(max(value.location.x / geo.size.width, 0), 1)
                                seekValue = ratio * viewModel.syncEngine.duration
                            }
                            .onEnded { _ in
                                viewModel.syncEngine.seek(to: seekValue)
                            }
                    )
                }
                .frame(height: 20)
            }

            // Time labels + controls
            HStack {
                Text(formattedTime(viewModel.syncEngine.currentTime))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.raveTextSecondary)

                Spacer()

                // Seek backward 10s
                Button {
                    viewModel.syncEngine.seekRelative(-10)
                } label: {
                    Image(systemName: "gobackward.10")
                        .font(.title3)
                        .foregroundColor(.raveTextPrimary)
                }

                // Play/Pause
                Button {
                    viewModel.syncEngine.togglePlayPause()
                } label: {
                    Image(systemName: viewModel.syncEngine.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title)
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(.raveGradient)
                        .clipShape(Circle())
                }

                // Seek forward 10s
                Button {
                    viewModel.syncEngine.seekRelative(10)
                } label: {
                    Image(systemName: "goforward.10")
                        .font(.title3)
                        .foregroundColor(.raveTextPrimary)
                }

                Spacer()

                Text(formattedTime(viewModel.syncEngine.duration))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.raveTextSecondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Bottom Bar

    @ViewBuilder
    private func bottomBar(viewModel: RoomViewModel) -> some View {
        HStack(spacing: 16) {
            // Voice chat toggle — start/end теперь async (строгий контракт).
            Button {
                Task {
                    if viewModel.voiceChat.isActive {
                        await viewModel.voiceChat.endCall()
                    } else {
                        do {
                            try await viewModel.voiceChat.startCall(roomId: viewModel.room.id)
                        } catch {
                            viewModel.errorMessage = "Voice error: \(error.localizedDescription)"
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: viewModel.voiceChat.isActive ? "waveform" : "waveform.slash")
                        .font(.subheadline)
                    Text(viewModel.voiceChat.isActive ? "Voice On" : "Join Voice")
                        .font(.caption.bold())
                }
                .foregroundColor(viewModel.voiceChat.isActive ? .raveGreen : .raveTextSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.raveCard)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(viewModel.voiceChat.isActive ? Color.raveGreen : Color.raveSurface, lineWidth: 1)
                )
            }

            // Mute toggle (only when voice is active)
            if viewModel.voiceChat.isActive {
                Button {
                    viewModel.voiceChat.toggleMute()
                } label: {
                    Image(systemName: viewModel.voiceChat.isMuted ? "mic.slash.fill" : "mic.fill")
                        .font(.subheadline)
                        .foregroundColor(viewModel.voiceChat.isMuted ? .raveDanger : .raveGreen)
                        .frame(width: 36, height: 36)
                        .background(Color.raveCard)
                        .clipShape(Circle())
                }
            }

            Spacer()

            // Chat button
            Button {
                showChat = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.left.fill")
                        .font(.subheadline)
                    Text("Chat")
                        .font(.caption.bold())
                }
                .foregroundColor(.raveTextPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.raveCard)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.raveSurface, lineWidth: 1)
                )
            }

            // Copy room code
            Button {
                UIPasteboard.general.string = viewModel.room.code
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(.subheadline)
                    .foregroundColor(.raveTextSecondary)
                    .frame(width: 36, height: 36)
                    .background(Color.raveCard)
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.raveCard.opacity(0.5))
    }

    // MARK: - Helpers

    private func progress(_ viewModel: RoomViewModel) -> CGFloat {
        guard viewModel.syncEngine.duration > 0 else { return 0 }
        return CGFloat(viewModel.syncEngine.currentTime / viewModel.syncEngine.duration)
    }

    private func formattedTime(_ time: TimeInterval) -> String {
        let hours = Int(time) / 3600
        let minutes = (Int(time) % 3600) / 60
        let seconds = Int(time) % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - AVPlayerViewController SwiftUI Wrapper
/// In production, use this to embed the native AVPlayer with full controls.
struct AVPlayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsTimecodes = true
        controller.allowsPictureInPicture = true
        controller.player?.play()
        return controller
    }

    func updateUIView(_ uiView: AVPlayerViewController, context: Context) {
        uiView.player = player
    }
}
