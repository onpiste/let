import SwiftUI

/// One-tap apps (Gmail, Calendar, Notion, …) through Composio. Hidden when
/// the deployment has no Composio key. Mirrors apps-settings.tsx. Sign-in is
/// Composio's own page, so it opens in Safari; the list refreshes on return.
struct AppsSection: View {
    let model: SettingsModel

    var body: some View {
        if let status = model.apps, status.available {
            Section {
                ForEach(status.apps) { app in
                    AppRow(model: model, app: app)
                }
            } header: {
                Text("Apps")
            } footer: {
                Text(
                    "Connect your accounts in one tap. The assistant can then read and act in them in every chat, including Telegram."
                )
            }
        }
    }
}

/// One app: name and state on the left, one action on the right. Only this
/// row waits while its own request runs; the others stay tappable.
private struct AppRow: View {
    let model: SettingsModel
    let app: AppsStatus.App
    @Environment(\.openURL) private var openURL
    @State private var confirmingDisconnect = false

    private var busy: Bool { model.busyApps.contains(app.slug) }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name).font(.body.weight(.medium))
                if app.connected {
                    Label("connected", systemImage: "checkmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.green)
                }
                if let problem = app.problem {
                    Text(problem.lowercased()).font(.footnote).foregroundStyle(.red)
                }
            }
            Spacer()
            action
        }
        .confirmationDialog(
            "Disconnect \(app.name)?",
            isPresented: $confirmingDisconnect,
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) {
                Task { await model.disconnectApp(app.slug) }
            }
        } message: {
            Text("The assistant will no longer be able to use \(app.name).")
        }
    }

    @ViewBuilder private var action: some View {
        if busy {
            ProgressView().frame(minWidth: 44)
        } else if app.connected {
            Button("Disconnect") { confirmingDisconnect = true }
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
        } else {
            Button("Connect") {
                Task {
                    if let url = await model.connectApp(app.slug) {
                        openURL(url)
                    }
                }
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .tint(.accentColor)
        }
    }
}
