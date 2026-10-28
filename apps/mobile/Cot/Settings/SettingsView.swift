import SwiftUI

/// Settings sheet: account, assistant persona/model, MCP servers, Telegram
/// and email. Everything is stored in the user's own assistant on the server.
struct SettingsView: View {
    let user: User
    let auth: AuthModel
    @State private var model: SettingsModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    init(user: User, auth: AuthModel) {
        self.user = user
        self.auth = auth
        _model = State(initialValue: SettingsModel(token: { auth.token }))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Signed in as", value: user.email)
                    Button("Sign out", role: .destructive) {
                        dismiss()
                        Task { await auth.signOut() }
                    }
                }
                if let error = model.error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if let settings = model.settings {
                    AssistantSection(model: model, settings: settings)
                    McpSection(model: model)
                    TelegramSection(model: model)
                    EmailSection(model: model)
                } else {
                    Section {
                        HStack {
                            ProgressView()
                            Text(model.connected ? "Loading…" : "Connecting…")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { model.start() }
        .onDisappear { model.stop() }
        .onChange(of: scenePhase) {
            // Back from Telegram: pick up the claim.
            if scenePhase == .active {
                model.reconnect()
                Task { await model.refreshTelegram() }
            }
        }
    }
}
