import SwiftUI

// MARK: - Room Card View
/// Displays a single room in the list with name, host, participants, and media info.
struct RoomCardView: View {
    let room: Room

    var body: some View {
        HStack(spacing: 14) {
            // Media thumbnail or placeholder
            mediaThumbnail
                .frame(width: 70, height: 70)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            // Room info
            VStack(alignment: .leading, spacing: 6) {
                Text(room.name)
                    .font(.headline)
                    .foregroundColor(.raveTextPrimary)
                    .lineLimit(1)

                Text("Hosted by \(room.hostName)")
                    .font(.caption)
                    .foregroundColor(.raveTextSecondary)

                HStack(spacing: 12) {
                    // Participants count
                    Label {
                        Text("\(room.participantCount)")
                            .font(.caption)
                            .foregroundColor(.raveTextSecondary)
                    } icon: {
                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                            .foregroundColor(.raveSecondary)
                    }

                    // Duration / time
                    if let mediaItem = room.mediaItem, let dur = mediaItem.formattedDuration {
                        Label {
                            Text(dur)
                                .font(.caption)
                                .foregroundColor(.raveTextSecondary)
                        } icon: {
                            Image(systemName: "clock")
                                .font(.caption2)
                                .foregroundColor(.raveWarning)
                        }
                    }

                    // Media type badge
                    if let mediaItem = room.mediaItem {
                        mediaTypeIcon(mediaItem.mediaType)
                    }
                }

                // Participant avatars stack
                HStack(spacing: 0) {
                    ForEach(room.participants.prefix(4)) { user in
                        userAvatar(user)
                    }
                    if room.participantCount > 4 {
                        Text("+\(room.participantCount - 4)")
                            .font(.caption2.bold())
                            .foregroundColor(.raveTextSecondary)
                            .padding(.leading, 6)
                    }
                }
            }

            Spacer()

            // Chevron
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.raveTextSecondary.opacity(0.5))
        }
        .padding(14)
        .background(Color.raveCard)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(room.isActive ? Color.ravePrimary.opacity(0.3) : Color.raveSurface, lineWidth: 1)
        )
    }

    // MARK: - Subviews

    @ViewBuilder
    private var mediaThumbnail: some View {
        if let thumbnailURL = room.mediaItem?.thumbnailURL, let url = URL(string: thumbnailURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure:
                    placeholderThumbnail
                default:
                    placeholderThumbnail.shimmer()
                }
            }
        } else {
            placeholderThumbnail
        }
    }

    private var placeholderThumbnail: some View {
        ZStack {
            Rectangle()
                .fill(Color.raveSurface)

            Image(systemName: room.mediaItem == nil ? "questionmark.folder" : "play.fill")
                .font(.title3)
                .foregroundColor(.raveTextSecondary)
        }
    }

    @ViewBuilder
    private func mediaTypeIcon(_ type: MediaItem.MediaType) -> some View {
        let (icon, color): (String, Color) = {
            switch type {
            case .movie: return ("film", .raveAccent)
            case .series: return ("tv", .raveSecondary)
            case .music: return ("music.note", .raveGreen)
            case .video: return ("video", .raveWarning)
            case .livestream: return ("dot.radiowaves.left.and.right", .raveDanger)
            }
        }()

        Image(systemName: icon)
            .font(.caption2)
            .foregroundColor(color)
    }

    @ViewBuilder
    private func userAvatar(_ user: UserPreview) -> some View {
        if let avatarURL = user.avatarURL, let url = URL(string: avatarURL) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Text(user.username.prefix(1).uppercased())
                        .font(.caption2.bold())
                        .foregroundColor(.white)
                        .background(Color.ravePrimary)
                }
            }
            .frame(width: 20, height: 20)
            .clipShape(Circle())
            .overlay(
                Circle()
                    .stroke(Color.raveBackground, lineWidth: 2)
            )
        } else {
            Text(user.username.prefix(1).uppercased())
                .font(.caption2.bold())
                .foregroundColor(.white)
                .frame(width: 20, height: 20)
                .background(user.isOnline ? Color.ravePrimary : Color.raveSurface)
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.raveBackground, lineWidth: 2)
                )
        }
    }
}

// MARK: - Preview
#Preview {
    ZStack {
        Color.raveBackground.ignoresSafeArea()
        VStack {
            RoomCardView(room: .preview)
            RoomCardView(room: Room(
                id: "room_002",
                name: "Chill Music 🎵",
                hostID: "user_002",
                hostName: "Jordan",
                code: "XYZ789",
                participants: [UserPreview(id: "user_002", username: "Jordan", avatarURL: nil, isOnline: true)],
                mediaItem: MediaItem(
                    id: "media_music",
                    title: "Lo-Fi Beats",
                    artist: "ChillHop",
                    thumbnailURL: nil,
                    streamURL: "",
                    duration: 3600,
                    mediaType: .music,
                    source: .url
                ),
                isActive: true,
                maxParticipants: 5,
                createdAt: .now.addingTimeInterval(-7200)
            ))
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}
