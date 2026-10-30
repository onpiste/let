import Foundation

// Mirrors @cot/shared settings.ts, telegram.ts and email.ts. The Worker
// validates every change, so this only carries the shapes and the provider
// list the pickers need.

struct ProviderInfo: Identifiable {
    let id: String
    let label: String
    let defaultModel: String
    let suggestions: [String]
    var needsKey: Bool {
        id != "workers-ai"
    }
}

enum Providers {
    static let all: [ProviderInfo] = [
        ProviderInfo(
            id: "workers-ai", label: "Workers AI", defaultModel: "@cf/openai/gpt-oss-120b",
            suggestions: [
                "@cf/moonshotai/kimi-k2.7-code",
                "@cf/moonshotai/kimi-k2.6",
                "@cf/openai/gpt-oss-120b",
                "@cf/openai/gpt-oss-20b",
                "@cf/zai-org/glm-4.7-flash",
                "@cf/meta/llama-4-scout-17b-16e-instruct",
                "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                "@cf/mistralai/mistral-small-3.1-24b-instruct",
                "@cf/google/gemma-4-26b-a4b-it",
                "@cf/qwen/qwen3-30b-a3b-fp8",
                "@cf/nvidia/nemotron-3-120b-a12b",
                "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
                "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
            ]
        ),
        ProviderInfo(
            id: "openai",
            label: "OpenAI",
            defaultModel: "gpt-5.5",
            suggestions: ["gpt-5.5"]
        ),
        ProviderInfo(
            id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-5-5",
            suggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
        ),
        ProviderInfo(id: "google", label: "Google", defaultModel: "", suggestions: [])
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
    var approvalMode: String
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

struct Skill: Decodable, Identifiable, Equatable {
    let name: String
    let description: String
    let instructions: String
    var id: String {
        name
    }
}
