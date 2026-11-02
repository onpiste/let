import SwiftUI

/// One-tap apps (Gmail, Calendar, Notion, …) through Composio. Hidden when
/// the deployment has no Composio key. Mirrors apps-settings.tsx. Sign-in is
/// Composio's own page, so it opens in Safari; the list refreshes on return.
struct AppsSection: View {
    let model: SettingsModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let status = model.apps, status.available {
            Section {
                ForEach(status.apps) { app in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.name).font(.body.weight(.medium))
                            if app.connected {
                                Text("connected").font(.footnote).foregroundStyle(.green)
                            }
                            if let problem = app.problem {
                                Text(problem.lowercased()).font(.footnote).foregroundStyle(.red)
                            }
                        }
                        Spacer()
                        if app.connected {
                            Button("Disconnect", role: .destructive) {
                                Task { await model.disconnectApp(app.slug) }
                            }
                            .buttonStyle(.borderless)
                        } else {
                            Button("Connect") {
                                Task {
                                    if let url = await model.connectApp(app.slug) {
                                        openURL(url)
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .disabled(model.busy)
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
