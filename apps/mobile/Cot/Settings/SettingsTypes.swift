import Foundation

/// Mirrors @cot/shared settings.ts, telegram.ts and email.ts. The Worker
/// validates every change, so this only carries the shapes and the provider
/// list the pickers need.

struct ProviderInfo: Identifiable {
    let id: String
    let label: String
    let defaultModel: String
    let suggestions: [String]
    var needsKey: Bool { id != "workers-ai" }
}

enum Providers {
    static let all: [ProviderInfo] = [
        ProviderInfo(
            id: "workers-ai", label: "Workers AI", defaultModel: "@cf/moonshotai/kimi-k2.7-code",
            suggestions: ["@cf/moonshotai/kimi-k2.7-code"]),
        ProviderInfo(id: "openai", label: "OpenAI", defaultModel: "gpt-5.5", suggestions: ["gpt-5.5"]),
        ProviderInfo(
            id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-5-5",
            suggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]),
        ProviderInfo(id: "google", label: "Google", defaultModel: "", suggestions: []),
    ]

    static func info(_ id: String) -> ProviderInfo {
        all.first { $0.id == id } ?? all[0]
    }
}

struct PublicSettings: Decodable, Equatable {
    struct KeyInfo: Decodable, Equatable { let last4: String }

    var assistantName: String
    var instructions: String
    var language: String
    var provider: String
    var model: String
    var apiKeys: [String: KeyInfo]
}

struct TelegramStatus: Decodable, Equatable {
    let configured: Bool
    let botUsername: String?
    let webhookSet: Bool?
    let linked: Bool?
    /// Open in Telegram and press Start to claim the bot (until linked).
    let claimUrl: String?
}

struct EmailStatus: Decodable, Equatable {
    let enabled: Bool
    let address: String?
    let alias: String?
    let domain: String?
    let acceptFromAnyone: Bool?
    let trustedSenders: [String]?
}

struct AddMcpResult: Decodable {
    let id: String
    let state: String
    let authUrl: String?
}
