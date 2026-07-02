import SwiftUI

// MARK: - DM Chat View v3 (Telegram/WhatsApp style)
/// Полноэкранный чат: свои сообщения справа (ледяной голубой),
/// чужие слева (тёмно-серый). Аватарки 28pt у чужих. Время 12pt.
/// Разделители по дням. Шрифт 16pt.
struct DMChatView: View {
    @StateObject private var dmService = DMChatService()
    @Environment(\.dismiss) private var dismiss

    let friend: Friend
    @State private var messageText = ""
    @State private var showEmojiPicker = false
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // ── Лента сообщений ───────────────────────────────────
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        // Дата-разделитель
                        DMDayDivider(label: "Сегодня")

                        ForEach(dmService.messages(for: friend.id)) { msg in
                            DMBubble(message: msg)
                                .id(msg.id)
                                .padding(.horizontal, 14)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .onChange(of: dmService.messages(for: friend.id).count) { _, _ in
                    if let lastID = dmService.messages(for: friend.id).last?.id {
                        withAnimation(.easeOut(duration: 0.25)) {
                            proxy.scrollTo(lastID, anchor: .bottom)
                        }
                    }
                }
            }

            // ── Эмодзи-пикер ─────────────────────────────────────
            if showEmojiPicker {
                EmojiPickerGrid(chatText: $messageText)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // ── Поле ввода ───────────────────────────────────────
            inputBar
        }
        .background(Color.raveBackground)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.raveBackground, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 10) {
                    if let urlStr = friend.avatarURL, let url = URL(string: urlStr) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                avatarHeader
                            }
                        }
                        .frame(width: 32, height: 32)
                        .clipShape(Circle())
                    } else {
                        avatarHeader
                            .frame(width: 32, height: 32)
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text(friend.username)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                        HStack(spacing: 4) {
                            Circle()
                                .fill(friend.isOnline ? Color.raveGreen : Color.raveTextTertiary)
                                .frame(width: 6, height: 6)
                            Text(friend.isOnline ? "в сети" : "не в сети")
                                .font(.system(size: 12))
                                .foregroundColor(.raveTextSecondary)
                        }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await dmService.loadHistory(friendId: friend.id, friendName: friend.username)
        }
    }

    private var avatarHeader: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [.ravePrimary, .raveAccent],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
            Text(friend.initials)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
        }
    }

    // MARK: - Input Bar (ледяной голубой)

    private var inputBar: some View {
        HStack(spacing: 10) {
            // Эмодзи
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEmojiPicker.toggle()
                }
                if showEmojiPicker { isInputFocused = false }
            } label: {
                Image(systemName: showEmojiPicker ? "keyboard.fill" : "face.smiling.fill")
                    .font(.system(size: 22))
                    .foregroundColor(showEmojiPicker ? .ravePrimary : .raveTextSecondary)
            }

            // Текстовое поле 16pt
            TextField("Сообщение...", text: $messageText)
                .font(.system(size: 16))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.06))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.08), lineWidth: 0.5))
                .onSubmit { sendAction() }

            // Кнопка отправки — ледяной голубой
            Button(action: sendAction) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(messageText.trimmingCharacters(in: .whitespaces).isEmpty
                        ? .raveTextTertiary : .ravePrimary)
            }
            .disabled(messageText.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    private func sendAction() {
        let text = messageText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        dmService.sendMessage(text, to: friend)
        messageText = ""
        HapticManager.impact(.light)
    }
}

// MARK: - DM Bubble v3 (Telegram style)

private struct DMBubble: View {
    let message: DirectMessage

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isOwnMessage {
                Spacer(minLength: 60)
            } else {
                // Аватарка 28pt только у чужих
                avatarView
            }

            VStack(alignment: message.isOwnMessage ? .trailing : .leading, spacing: 2) {
                Text(message.text)
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(message.isOwnMessage
                        ? AnyShapeStyle(Color.ravePrimary.opacity(0.85))
                        : AnyShapeStyle(Color.white.opacity(0.08)))
                    .clipShape(ChatBubbleShapeDM(isOwn: message.isOwnMessage))
                    .overlay(
                        ChatBubbleShapeDM(isOwn: message.isOwnMessage)
                            .stroke(Color.white.opacity(message.isOwnMessage ? 0 : 0.06), lineWidth: 0.5)
                    )

                // Время 12pt
                Text(message.timeString)
                    .font(.system(size: 12))
                    .foregroundColor(.raveTextTertiary)
                    .padding(.trailing, message.isOwnMessage ? 4 : 0)
                    .padding(.leading, message.isOwnMessage ? 0 : 4)
            }
        }
    }

    @ViewBuilder
    private var avatarView: some View {
        let size: CGFloat = 28
        if let avatarURL = message.senderAvatarURL, let url = URL(string: avatarURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    avatarPlaceholder
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            avatarPlaceholder
                .frame(width: size, height: size)
        }
    }

    private var avatarPlaceholder: some View {
        ZStack {
            Circle()
                .fill(avatarColor)
            Text(message.initials)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
    }

    private var avatarColor: Color {
        let palette: [Color] = [.ravePrimary, .raveAccent, .raveGreen, .raveWarning, .raveCyan, .raveSecondary]
        let hash = abs(message.senderID.hashValue)
        return palette[hash % palette.count]
    }
}

// MARK: - Day Divider
private struct DMDayDivider: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.raveTextSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.06))
            .clipShape(Capsule())
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
    }
}

// MARK: - Bubble Shape
private struct ChatBubbleShapeDM: Shape {
    let isOwn: Bool

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: [.topLeft, .topRight, isOwn ? .bottomLeft : .bottomRight],
            cornerRadii: CGSize(width: 16, height: 16)
        )
        return Path(path.cgPath)
    }
}
