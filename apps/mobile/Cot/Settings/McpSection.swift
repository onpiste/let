import SwiftUI

/// Remote MCP servers: list, add, remove. Servers that need OAuth are
/// authorized from the web app, because the OAuth callback lands on a web
/// page that needs the browser's session cookie, which this app doesn't hold.
struct McpSection: View {
    let model: SettingsModel
    @State private var name = ""
    @State private var url = ""

    var body: some View {
        Section {
            let servers = (model.mcp?.servers ?? [:]).sorted { $0.key < $1.key }
            if servers.isEmpty {
                Text("No servers yet.").foregroundStyle(.secondary)
            }
            ForEach(servers, id: \.key) { id, server in
                VStack(alignment: .leading, spacing: 2) {
                    Text(server.name).font(.body.weight(.medium))
                    Text(server.serverURL).font(.footnote).foregroundStyle(.secondary)
                    Text(status(server, id: id))
                        .font(.footnote)
                        .foregroundStyle(server.error == nil ? Color.secondary : Color.red)
                }
                .swipeActions {
                    Button("Remove", role: .destructive) { Task { await model.removeMcp(id) } }
                }
            }
            Menu("Popular connectors") {
                ForEach(Self.presets, id: \.name) { preset in
                    Button(preset.name) {
                        name = preset.name
                        url = preset.url
                    }
                }
            }
            TextField("Name", text: $name)
            TextField("https://server/mcp", text: $url)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Add server") {
                Task {
                    if await model.addMcp(name: name, url: url) != nil {
                        name = ""
                        url = ""
                    }
                }
            }
            .disabled(name.isEmpty || url.isEmpty || model.busy)
        } header: {
            Text("Connectors (MCP servers)")
        } footer: {
            Text(
                "Tools from connected servers are available to the Think assistant in every chat, including Telegram. Servers that need sign-in: authorize them once in the web app."
            )
        }
    }

    /// Keep in sync with CONNECTOR_PRESETS in packages/shared/src/connectors.ts.
    private static let presets: [(name: String, url: String)] = [
        ("Notion", "https://mcp.notion.com/mcp"),
        ("Linear", "https://mcp.linear.app/mcp"),
        ("GitHub", "https://api.githubcopilot.com/mcp/"),
        ("Sentry", "https://mcp.sentry.dev/mcp"),
        ("Atlassian", "https://mcp.atlassian.com/v1/sse"),
        ("Asana", "https://mcp.asana.com/sse"),
        ("Cloudflare Docs", "https://docs.mcp.cloudflare.com/mcp"),
    ]

    private func status(_ server: McpState.Server, id: String) -> String {
        var text = server.state
        if server.state == "ready" {
            let count = model.mcp?.tools.filter { $0.serverId == id }.count ?? 0
            text += " · \(count) tools"
        }
        if let error = server.error {
            text += " · \(error)"
        }
        return text
    }
}
