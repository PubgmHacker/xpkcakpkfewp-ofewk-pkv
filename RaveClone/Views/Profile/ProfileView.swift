import SwiftUI

// MARK: - Profile View
struct ProfileView: View {
    @State private var viewModel: ProfileViewModel
    @Environment(\.dismiss) private var dismiss
    var onSignOut: () -> Void

    init(viewModel: ProfileViewModel, onSignOut: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onSignOut = onSignOut
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.raveBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Avatar + name
                        VStack(spacing: 16) {
                            // Avatar circle
                            ZStack {
                                Circle()
                                    .fill(.raveGradient)
                                    .frame(width: 100, height: 100)

                                Text(viewModel.displayName.prefix(2).uppercased())
                                    .font(.system(size: 36, weight: .bold))
                                    .foregroundColor(.white)
                            }

                            VStack(spacing: 4) {
                                Text(viewModel.displayName)
                                    .font(.title2.bold())
                                    .foregroundColor(.raveTextPrimary)

                                Text(viewModel.email)
                                    .font(.caption)
                                    .foregroundColor(.raveTextSecondary)
                            }
                        }
                        .padding(.top, 20)

                        // Stats
                        HStack(spacing: 0) {
                            statBox(value: "42", label: "Rooms Joined")
                            statBox(value: "128", label: "Hours Watched")
                            statBox(value: "15", label: "Friends")
                        }
                        .raveCardStyle()

                        // Settings sections
                        settingsSection("Account") {
                            settingsRow(icon: "person.text.rectangle", title: "Edit Profile", color: .ravePrimary) {}
                            settingsRow(icon: "bell", title: "Notifications", color: .raveWarning) {}
                            settingsRow(icon: "shield", title: "Privacy", color: .raveGreen) {}
                        }

                        settingsSection("Preferences") {
                            settingsRow(icon: "paintbrush", title: "Theme", color: .raveSecondary) {}
                            settingsRow(icon: "speaker.wave.2", title: "Audio Settings", color: .raveAccent) {}
                            settingsRow(icon: "network", title: "Sync Settings", color: .ravePrimary) {}
                        }

                        settingsSection("Danger Zone") {
                            Button(role: .destructive) {
                                showDeleteAlert = true
                            } label: {
                                HStack {
                                    Image(systemName: "trash")
                                        .foregroundColor(.raveDanger)
                                    Text("Delete Account")
                                        .foregroundColor(.raveDanger)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(.raveTextSecondary.opacity(0.5))
                                }
                            }
                        }

                        // Sign Out
                        Button(action: {
                            Task {
                                await viewModel.authService.signOut()
                                onSignOut()
                                dismiss()
                            }
                        }) {
                            Text("Sign Out")
                                .frame(maxWidth: .infinity)
                        }
                        .raveSecondaryButtonStyle()
                        .padding(.top, 8)

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 20)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.ravePrimary)
                }
            }
            .preferredColorScheme(.dark)
            .task {
                await viewModel.loadUser()
            }
            .alert("Delete Account?", isPresented: $showDeleteAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        await viewModel.deleteAccount()
                        onSignOut()
                        dismiss()
                    }
                }
            } message: {
                Text("This action cannot be undone. All your data will be permanently deleted.")
            }
        }
    }

    // MARK: - State
    @State private var showDeleteAlert = false

    // MARK: - Components

    private func statBox(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2.bold().monospacedDigit())
                .foregroundColor(.ravePrimary)

            Text(label)
                .font(.caption2)
                .foregroundColor(.raveTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.caption.bold())
                .foregroundColor(.raveTextSecondary)
                .padding(.leading, 4)
                .padding(.bottom, 8)

            content()
        }
    }

    private func settingsRow(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundColor(color)
                    .frame(width: 30, height: 30)
                    .background(color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.raveTextPrimary)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.raveTextSecondary.opacity(0.5))
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 4)
        }
    }
}
