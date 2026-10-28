import Foundation

/// The MCP servers the assistant reports in `cf_agent_mcp_servers`.
struct McpState: Decodable, Equatable {
    struct Server: Decodable, Equatable {
        let name: String
        let serverURL: String
        let state: String
        let authURL: String?
        let error: String?

        private enum CodingKeys: String, CodingKey {
            case name, state, error
            case serverURL = "server_url"
            case authURL = "auth_url"
        }
    }

    struct Tool: Decodable, Equatable {
        let serverId: String
        let name: String
    }

    let servers: [String: Server]
    let tools: [Tool]

    /// "server · tool" labels keyed by the AI SDK tool name, which is
    /// `tool_<server id without dashes>_<tool>`.
    var toolLabels: [String: String] {
        var labels: [String: String] = [:]
        for tool in tools {
            let server = servers[tool.serverId]?.name ?? "MCP"
            labels["tool_\(tool.serverId.replacingOccurrences(of: "-", with: ""))_\(tool.name)"] =
                "\(server) · \(tool.name)"
        }
        return labels
    }
}
