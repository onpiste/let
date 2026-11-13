import Foundation
import os

/// Developer-mode logs from the app (mirrors apps/web/src/lib/dev-log.ts).
/// When the deployment has DEV_LOGS on, lines are batched to the Worker's
/// /dev/logs, which writes them to Workers Logs next to its own, in the
/// `LogEntry` format of @cot/shared. Every line also goes to `os.Logger`, so
/// the Xcode console still shows it. See .agents/skills/dev-logs/SKILL.md.
@MainActor
final class DevLog {
    /// `LogEntry` in packages/shared/src/logs.ts; keep the two in step.
    struct Entry: Codable, Equatable {
        let ts: String
        let level: String
        let source: String
        let scope: String
        let msg: String
        let session: String
        let version: String
        let data: [String: String]?
    }

    static let shared = DevLog()

    /// The signed-in bearer token; RootView sets it.
    var token: () -> String? = { nil }

    /// nil until /dev/status answers; lines wait in the queue until then.
    private(set) var enabled: Bool?
    private(set) var queue: [Entry] = []
    private let session = UUID().uuidString
    private let version =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    private let logger = Logger(subsystem: "cot", category: "app")
    private var timer: Task<Void, Never>?

    static let maxBatch = 100
    private static let maxQueue = 500
    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func info(_ scope: String, _ msg: String, _ data: [String: String]? = nil) {
        shared.add("info", scope, msg, data)
    }

    static func warn(_ scope: String, _ msg: String, _ data: [String: String]? = nil) {
        shared.add("warn", scope, msg, data)
    }

    static func error(
        _ scope: String, _ msg: String, _ error: Error? = nil, _ data: [String: String]? = nil
    ) {
        var data = data ?? [:]
        if let error {
            data["error"] = String(describing: error)
        }
        shared.add("error", scope, msg, data.isEmpty ? nil : data)
    }

    func add(_ level: String, _ scope: String, _ msg: String, _ data: [String: String]?) {
        logger
            .log(
                "[\(level, privacy: .public)] \(scope, privacy: .public): \(msg, privacy: .public)"
            )
        guard enabled != false else { return }
        queue.append(Entry(
            ts: Self.iso.string(from: Date()), level: level, source: "ios", scope: scope,
            msg: msg, session: session, version: version, data: data
        ))
        if queue.count > Self.maxQueue {
            queue.removeFirst(queue.count - Self.maxQueue)
        }
        if enabled == true, queue.count >= Self.maxBatch {
            Task { await flush() }
        }
    }

    /// Asks the Worker whether to send logs; when it says yes, flushes every
    /// few seconds until the app goes to the background.
    func start() async {
        var status: Bool?
        if let reply = try? await URLSession.shared.data(from: Config.url("dev/status")),
           (reply.1 as? HTTPURLResponse)?.statusCode == 200,
           let object = try? JSONSerialization.jsonObject(with: reply.0) as? [String: Any]
        {
            status = object["enabled"] as? Bool
        }
        apply(enabled: status == true)
        guard enabled == true else { return }
        DevLog.info(
            "app",
            "App launched",
            ["system": ProcessInfo.processInfo.operatingSystemVersionString]
        )
        timer?.cancel()
        timer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                await self?.flush()
            }
        }
    }

    func apply(enabled: Bool) {
        self.enabled = enabled
        if !enabled {
            queue.removeAll()
        }
    }

    /// Sends what's queued. Signed out or offline: those lines are lost,
    /// which is fine for logs.
    func flush() async {
        guard enabled == true, !queue.isEmpty, let token = token() else { return }
        let batch = Array(queue.prefix(Self.maxBatch))
        queue.removeFirst(batch.count)
        guard let body = try? JSONEncoder().encode(["entries": batch]) else { return }
        var request = URLRequest(url: Config.url("dev/logs"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        _ = try? await URLSession.shared.data(for: request)
    }
}
