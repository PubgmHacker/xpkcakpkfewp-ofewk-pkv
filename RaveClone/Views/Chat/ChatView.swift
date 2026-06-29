import SwiftUI

// MARK: - Chat View
/// In-room text chat overlay. Messages sent via WebSocket, displayed in real-time.
struct ChatView: View {
    let messages: [ChatMessage]
    @Binding var chatText: String
    var onSend: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Color.raveBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Messages list
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(messages) { message in
                                    ChatBubble(message: message)
                                        .id(message.id)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .onChange(of: messages.count) { _, _ in
                            if let lastID = messages.last?.id {
                                withAnimation {
                                    proxy.scrollTo(lastID, anchor: .bottom)
                                }
                            }
                        }
                    }

                    Divider()
                        .background(Color.raveSurface)

                    // Input bar
                    HStack(spacing: 10) {
                        TextField("Type a message...", text: $chatText)
                            .textFieldStyle(RaveTextFieldStyle())
                            .onSubmit { onSend() }

                        Button(action: onSend) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundColor(chatText.trimmingCharacters(in: .whitespaces).isEmpty
                                    ? .raveSurface : .ravePrimary)
                        }
                        .disabled(chatText.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
            }
            .navigationTitle("Chat")
            .navigationBarTitleDisplayMode(.inline)
            .preferredColorScheme(.dark)
        }
    }
}

// MARK: - Chat Bubble
private struct ChatBubble: View {
    let message: ChatMessage

    private var isOwnMessage: Bool {
        message.senderName == "You"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isOwnMessage { Spacer(minLength: 40) }

            VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                // Sender name
                if !isOwnMessage {
                    Text(message.senderName)
                        .font(.caption2.bold())
                        .foregroundColor(.raveSecondary)
                        .padding(.leading, 4)
                }

                // Bubble
                Text(message.text)
                    .font(.subheadline)
                    .foregroundColor(isOwnMessage ? .white : .raveTextPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isOwnMessage ? Color.ravePrimary : Color.raveCard)
                    .clipShape(ChatBubbleShape(isOwn: isOwnMessage))

                // Timestamp
                Text(message.timeString)
                    .font(.caption2)
                    .foregroundColor(.raveTextSecondary.opacity(0.6))
                    .padding(.trailing, 4)
            }
        }
    }
}

// MARK: - Chat Bubble Shape
private struct ChatBubbleShape: Shape {
    let isOwn: Bool

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: [.topLeft, .topRight, isOwn ? .bottomLeft : .bottomRight],
            cornerRadii: CGSize(width: 14, height: 14)
        )
        return Path(path.cgPath)
    }
}

// MARK: - Preview
#Preview {
    ChatView(
        messages: [
            .preview,
            ChatMessage(
                id: "msg_002", roomID: "room_001", senderID: "user_002",
                senderName: "Jordan", text: "This sync is amazing! 🔥",
                timestamp: .now.addingTimeInterval(-60), isRead: true
            ),
            ChatMessage(
                id: "msg_003", roomID: "room_001", senderID: "user_001",
                senderName: "You", text: "Right?! No more 3-2-1 counting 😂",
                timestamp: .now, isRead: false
            ),
        ],
        chatText: .constant(""),
        onSend: {}
    )
    .preferredColorScheme(.dark)
}
