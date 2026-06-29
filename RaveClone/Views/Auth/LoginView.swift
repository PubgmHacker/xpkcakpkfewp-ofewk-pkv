import SwiftUI

// MARK: - Login View
struct LoginView: View {
    @State private var viewModel: AuthViewModel
    var onSignIn: () -> Void

    init(viewModel: AuthViewModel, onSignIn: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onSignIn = onSignIn
    }

    var body: some View {
        ZStack {
            // Background
            Color.raveBackground
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Logo / Branding
                VStack(spacing: 12) {
                    Image(systemName: "play.rectangle.on.rectangle")
                        .font(.system(size: 60))
                        .foregroundGradient(.raveGradient)

                    Text("SyncWatch")
                        .font(.largeTitle.bold())
                        .foregroundColor(.raveTextPrimary)

                    Text("Watch together, in perfect sync")
                        .font(.subheadline)
                        .foregroundColor(.raveTextSecondary)
                }

                Spacer()

                // Form
                VStack(spacing: 16) {
                    TextField("Email", text: $viewModel.email)
                        .textFieldStyle(RaveTextFieldStyle())

                    SecureField("Password", text: $viewModel.password)
                        .textFieldStyle(RaveTextFieldStyle())
                }
                .padding(.horizontal, 24)

                // Error
                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.raveDanger)
                        .padding(.horizontal, 24)
                }

                // Sign In Button
                Button(action: {
                    Task {
                        await viewModel.signIn()
                        if viewModel.isSignedIn {
                            onSignIn()
                        }
                    }
                }) {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(viewModel.isLoading ? "Signing in..." : "Sign In")
                    }
                    .frame(maxWidth: .infinity)
                }
                .raveButtonStyle()
                .padding(.horizontal, 24)
                .disabled(!viewModel.isFormValid || viewModel.isLoading)

                Spacer()

                // Sign Up link
                NavigationLink {
                    SignUpView(viewModel: viewModel, onSignUp: onSignIn)
                } label: {
                    Text("Don't have an account? Sign Up")
                        .font(.subheadline)
                        .foregroundColor(.ravePrimary)
                }
                .padding(.bottom, 32)
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Sign Up View
struct SignUpView: View {
    @State private var viewModel: AuthViewModel
    var onSignUp: () -> Void

    init(viewModel: AuthViewModel, onSignUp: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onSignUp = onSignUp
    }

    var body: some View {
        ZStack {
            Color.raveBackground
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 12) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 50))
                        .foregroundGradient(.raveGradient)

                    Text("Create Account")
                        .font(.largeTitle.bold())
                        .foregroundColor(.raveTextPrimary)
                }

                Spacer()

                VStack(spacing: 16) {
                    TextField("Username", text: $viewModel.username)
                        .textFieldStyle(RaveTextFieldStyle())

                    TextField("Email", text: $viewModel.email)
                        .textFieldStyle(RaveTextFieldStyle())

                    SecureField("Password", text: $viewModel.password)
                        .textFieldStyle(RaveTextFieldStyle())
                }
                .padding(.horizontal, 24)

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.raveDanger)
                        .padding(.horizontal, 24)
                }

                Button(action: {
                    Task {
                        await viewModel.signUp()
                        if viewModel.isSignedIn {
                            onSignUp()
                        }
                    }
                }) {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(viewModel.isLoading ? "Creating account..." : "Sign Up")
                    }
                    .frame(maxWidth: .infinity)
                }
                .raveButtonStyle()
                .padding(.horizontal, 24)
                .disabled(!viewModel.isSignUpFormValid || viewModel.isLoading)

                Spacer()

                NavigationLink {
                    LoginView(viewModel: viewModel, onSignIn: onSignUp)
                } label: {
                    Text("Already have an account? Sign In")
                        .font(.subheadline)
                        .foregroundColor(.ravePrimary)
                }
                .padding(.bottom, 32)
            }
        }
        .navigationBarBackButtonHidden()
        .preferredColorScheme(.dark)
    }
}

// MARK: - Custom Text Field Style
struct RaveTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.raveSurface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.raveSurface.opacity(0.3), lineWidth: 1)
            )
            .foregroundColor(.raveTextPrimary)
            .font(.body)
            .autocapitalization(.none)
            .disableAutocorrection(true)
            .textInputAutocapitalization(.never)
    }
}
