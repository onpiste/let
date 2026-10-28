import Foundation

/// The Agents SDK WebSocket to one assistant: reconnects with a short backoff,
/// keeps the connection alive, and multiplexes `{type:"rpc"}` calls (the
/// `AssistantRpc` interface in @cot/shared) next to the chat frames.
@MainActor
final class AgentSocket {
    struct RPCError: LocalizedError {
        let message: String
        var errorDescription: String? {
            message
        }
    }

    var onOpen: (() -> Void)?
    var onClose: (() -> Void)?
    var onFrame: ((JSONValue) -> Void)?

    private(set) var isOpen = false

    private let url: URL
    private let token: () -> String?
    private let delegate = SocketDelegate()
    private lazy var session = URLSession(
        configuration: .default, delegate: delegate, delegateQueue: nil
    )
    private var task: URLSessionWebSocketTask?
    private var keepAlive: Task<Void, Never>?
    private var retry: Task<Void, Never>?
    private var failures = 0
    private var wantsConnection = false
    private var pending: [String: CheckedContinuation<JSONValue, Error>] = [:]
    /// RPCs issued while the socket is down go out once it opens.
    private var outbox: [String] = []

    init(url: URL, token: @escaping () -> String?) {
        self.url = url
        self.token = token
        delegate.onOpen = { [weak self] task in
            Task { @MainActor in self?.opened(task) }
        }
        delegate.onClose = { [weak self] task in
            Task { @MainActor in self?.closed(task) }
        }
    }

    func start() {
        wantsConnection = true
        connect()
    }

    func stop() {
        wantsConnection = false
        retry?.cancel()
        teardown()
        failPending(RPCError(message: "Disconnected"))
    }

    /// Reconnects now if the socket is down (e.g. after the app resumed).
    func reconnectIfNeeded() {
        guard wantsConnection, !isOpen else { return }
        retry?.cancel()
        connect()
    }

    func send(_ frame: JSONValue) {
        guard isOpen else { return }
        task?.send(.string(frame.serialized())) { _ in }
    }

    func call(_ method: String, _ args: [JSONValue] = []) async throws -> JSONValue {
        let id = UUID().uuidString
        let frame = JSONValue.object([
            "type": .string("rpc"), "id": .string(id),
            "method": .string(method), "args": .array(args)
        ])
        guard wantsConnection else { throw RPCError(message: "Disconnected") }
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            if isOpen {
                task?.send(.string(frame.serialized())) { _ in }
            } else {
                outbox.append(frame.serialized())
            }
        }
    }

    // MARK: Connection

    private func connect() {
        teardown()
        guard let bearer = token() else { return }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        // The SDK client names its connection this way; harmless to mirror.
        components.queryItems = [URLQueryItem(name: "_pk", value: UUID().uuidString)]
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        receive(from: task)
    }

    private func teardown() {
        keepAlive?.cancel()
        let old = task
        task = nil
        old?.cancel(with: .goingAway, reason: nil)
        if isOpen {
            isOpen = false
            onClose?()
        }
    }

    private func receive(from socket: URLSessionWebSocketTask) {
        Task { [weak self] in
            while true {
                do {
                    let message = try await socket.receive()
                    guard let self, task === socket else { return }
                    switch message {
                    case let .string(text): handle(text)
                    case let .data(data): handle(String(decoding: data, as: UTF8.self))
                    @unknown default: break
                    }
                } catch {
                    self?.closed(socket)
                    return
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let frame = JSONValue.parse(text) else { return }
        if frame["type"]?.string == "rpc", let id = frame["id"]?.string,
           let continuation = pending[id]
        {
            if frame["success"]?.bool == false {
                pending[id] = nil
                continuation.resume(
                    throwing: RPCError(message: frame["error"]?.string ?? "Request failed")
                )
            } else if frame["done"]?.bool != false {
                // Streaming calls (done == false) aren't used by the app.
                pending[id] = nil
                continuation.resume(returning: frame["result"] ?? .null)
            }
            return
        }
        onFrame?(frame)
    }

    private func opened(_ socket: URLSessionWebSocketTask) {
        guard task === socket, !isOpen else { return }
        isOpen = true
        failures = 0
        for frame in outbox {
            socket.send(.string(frame)) { _ in }
        }
        outbox.removeAll()
        startKeepAlive(socket)
        onOpen?()
    }

    private func closed(_ socket: URLSessionWebSocketTask) {
        guard task === socket else { return }
        keepAlive?.cancel()
        task = nil
        socket.cancel(with: .goingAway, reason: nil)
        // Also reported when it never opened (offline, or the session was
        // refused), so the owner can re-check the session.
        isOpen = false
        onClose?()
        guard wantsConnection else { return }
        failures += 1
        let delay = min(Double(failures), 3)
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.connect()
        }
    }

    /// A backgrounded phone can leave a socket that looks open but is dead;
    /// a failed ping closes it so the retry path takes over.
    private func startKeepAlive(_ socket: URLSessionWebSocketTask) {
        keepAlive = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                guard !Task.isCancelled else { return }
                socket.sendPing { error in
                    if error != nil {
                        Task { @MainActor in self?.closed(socket) }
                    }
                }
            }
        }
    }

    private func failPending(_ error: Error) {
        let calls = pending
        pending.removeAll()
        outbox.removeAll()
        for continuation in calls.values {
            continuation.resume(throwing: error)
        }
    }
}

/// Reports the handshake outcome, which `URLSessionWebSocketTask` doesn't
/// surface through `receive()` until a message arrives.
private final class SocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    var onOpen: ((URLSessionWebSocketTask) -> Void)?
    var onClose: ((URLSessionWebSocketTask) -> Void)?

    func urlSession(
        _: URLSession, webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol _: String?
    ) {
        onOpen?(webSocketTask)
    }

    func urlSession(
        _: URLSession, webSocketTask: URLSessionWebSocketTask,
        didCloseWith _: URLSessionWebSocketTask.CloseCode, reason _: Data?
    ) {
        onClose?(webSocketTask)
    }

    func urlSession(_: URLSession, task: URLSessionTask, didCompleteWithError _: Error?) {
        if let socket = task as? URLSessionWebSocketTask {
            onClose?(socket)
        }
    }
}
