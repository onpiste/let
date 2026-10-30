import Foundation

/// Registers this phone for pushes (AssistantRpc registerPushDevice).
extension ChatStore {
    /// Sent on every connection: cheap, and it keeps the server's copy current.
    func registerPush() {
        guard let token = Push.deviceToken else { return }
        let device = JSONValue.object([
            "token": .string(token),
            "environment": .string(Push.environment)
        ])
        Task {
            let status = try? await socket.call("registerPushDevice", [device])
            Push.serverSends = status?["enabled"]?.bool == true
        }
    }
}
