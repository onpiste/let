import Foundation
import Observation

/// The settings page's state. It talks to the Think assistant over its own
/// socket (the settings callables live there whichever harness is chatting),
/// using the `AssistantRpc` methods from @cot/shared.
@MainActor
@Observable
final class SettingsModel {
    private(set) var settings: PublicSettings?
    private(set) var mcp: McpState?
    private(set) var skills: [Skill] = []
    private(set) var telegram: TelegramStatus?
    private(set) var email: EmailStatus?
    private(set) var connected = false
    var error: String?
    private(set) var busy = false

    private let socket: AgentSocket

    init(token: @escaping () -> String?) {
        socket = AgentSocket(url: Config.socketURL(basePath: "chat"), token: token)
        socket.onFrame = { [weak self] frame in
            guard frame["type"]?.string == "cf_agent_mcp_servers" else { return }
            self?.mcp = frame["mcp"].flatMap { try? $0.decoded(as: McpState.self) }
        }
        socket.onOpen = { [weak self] in
            self?.connected = true
            Task { await self?.load() }
        }
        socket.onClose = { [weak self] in self?.connected = false }
    }

    func start() {
        socket.start()
    }

    func stop() {
        socket.stop()
    }

    func reconnect() {
        socket.reconnectIfNeeded()
    }

    func load() async {
        await run { [self] in
            settings = try await call("getSettings")
            telegram = try await call("getTelegramStatus")
            email = try await call("getEmailStatus")
            skills = try await call("listSkills")
        }
    }

    func save(_ patch: JSONValue) async -> Bool {
        await run { [self] in settings = try await call("updateSettings", [patch]) }
    }

    func saveSkill(name: String, description: String, instructions: String) async -> Bool {
        let skill = JSONValue.object([
            "name": .string(name),
            "description": .string(description),
            "instructions": .string(instructions)
        ])
        return await run { [self] in skills = try await call("saveSkill", [skill]) }
    }

    func deleteSkill(_ name: String) async {
        await run { [self] in skills = try await call("deleteSkill", [.string(name)]) }
    }

    func addMcp(name: String, url: String) async -> AddMcpResult? {
        var result: AddMcpResult?
        await run { [self] in result = try await call("addMcp", [.string(name), .string(url)]) }
        return result
    }

    func removeMcp(_ id: String) async {
        await run { [self] in _ = try await socket.call("removeMcp", [.string(id)]) }
    }

    func connectTelegram(token: String) async {
        await run { [self] in telegram = try await call("connectTelegram", [.string(token)]) }
    }

    func newTelegramClaimLink() async {
        await run { [self] in telegram = try await call("newTelegramClaimLink") }
    }

    func disconnectTelegram() async {
        await run { [self] in telegram = try await call("disconnectTelegram") }
    }

    func refreshTelegram() async {
        await run { [self] in telegram = try await call("getTelegramStatus") }
    }

    func setEmailAlias(_ alias: String) async {
        await run { [self] in email = try await call("setEmailAlias", [.string(alias)]) }
    }

    func updateEmailPolicy(acceptFromAnyone: Bool, trustedSenders: [String]) async {
        let policy = JSONValue.object([
            "acceptFromAnyone": .bool(acceptFromAnyone),
            "trustedSenders": .array(trustedSenders.map(JSONValue.string))
        ])
        await run { [self] in email = try await call("updateEmailPolicy", [policy]) }
    }

    private func call<T: Decodable>(_ method: String, _ args: [JSONValue] = []) async throws -> T {
        try await socket.call(method, args).decoded(as: T.self)
    }

    @discardableResult
    private func run(_ work: () async throws -> Void) async -> Bool {
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await work()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}
