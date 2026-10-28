import Foundation

/// The scheduled-task calls of AssistantRpc (listTasks / pauseTask / …).
extension ChatStore {
    func tasks() async throws -> [ScheduledTask] {
        try await taskCall("listTasks")
    }

    func pauseTask(_ id: String) async throws -> [ScheduledTask] {
        try await taskCall(
            "pauseTask",
            id
        )
    }

    func resumeTask(_ id: String) async throws -> [ScheduledTask] {
        try await taskCall(
            "resumeTask",
            id
        )
    }

    func deleteTask(_ id: String) async throws -> [ScheduledTask] {
        try await taskCall(
            "deleteTask",
            id
        )
    }

    private func taskCall(_ method: String, _ id: String? = nil) async throws -> [ScheduledTask] {
        let args: [JSONValue] = id.map { [JSONValue.string($0)] } ?? []
        return try await socket.call(method, args).decoded(as: [ScheduledTask].self)
    }
}
