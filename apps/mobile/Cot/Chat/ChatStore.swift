import Foundation
import Observation
import UIKit

/// The chat with the assistant: the message list, the turn in
/// flight and the push notices, driven by the agent socket's frames. The
/// frame types are the Agents SDK chat protocol (`cf_agent_*`).
@MainActor
@Observable
final class ChatStore {
    enum Status { case ready, submitted, streaming }

    struct Notice: Identifiable, Equatable {
        let id = UUID()
        let icon: String
        let title: String
        let text: String
    }

    /// A message written while the assistant was still answering; sent when
    /// the turn ends.
    struct Queued: Identifiable, Equatable {
        let id = UUID()
        let text: String
        let attachments: [Attachment]
    }

    private(set) var messages: [ChatMessage] = []
    private(set) var queue: [Queued] = []
    private(set) var status: Status = .ready
    private(set) var connected = false
    private(set) var mcp: McpState?
    private(set) var errorText: String?
    var notice: Notice?

    let socket: AgentSocket
    var onConnectionLost: (() -> Void)?

    private var requestID: String?
    private var streamingMessageID: String?
    private var reducer = ChunkReducer()
    private var appliedSeq: [String: Int] = [:]
    private var lastAuthCheck = Date.distantPast

    var busy: Bool { status != .ready }

    init(token: @escaping () -> String?) {
        socket = AgentSocket(url: Config.socketURL(basePath: "chat"), token: token)
        socket.onFrame = { [weak self] in self?.handle($0) }
        socket.onOpen = { [weak self] in self?.opened() }
        socket.onClose = { [weak self] in self?.closed() }
    }

    func start() { socket.start() }
    func disconnect() { socket.stop() }
    func resume() { socket.reconnectIfNeeded() }

    // MARK: Actions

    func send(_ text: String, attachments: [Attachment] = []) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !attachments.isEmpty else { return }
        if busy {
            queue.append(Queued(text: trimmed, attachments: attachments))
            return
        }
        dispatch(trimmed, attachments)
    }

    func removeQueued(_ id: Queued.ID) { queue.removeAll { $0.id == id } }

    private func dispatch(_ trimmed: String, _ attachments: [Attachment]) {
        errorText = nil
        messages.append(.user(text: trimmed, attachments: attachments))
        let id = randomID(length: 8)
        requestID = id
        status = .submitted
        let body = JSONValue.object([
            "messages": .array(messages.map(\.json)),
            "trigger": .string("submit-message"),
        ])
        socket.send(
            .object([
                "type": .string("cf_agent_use_chat_request"),
                "id": .string(id),
                "init": .object(["method": .string("POST"), "body": .string(body.serialized())]),
            ]))
    }

    /// Shows a problem (e.g. a file that can't be attached) under the chat.
    func report(_ message: String) { errorText = message }

    func stopTurn() {
        guard let requestID else { return }
        socket.send(
            .object(["type": .string("cf_agent_chat_request_cancel"), "id": .string(requestID)]))
        finishTurn()
    }

    // MARK: History (AssistantRpc listChats / newChat / openChat / deleteChat)

    /// The server swaps the conversation and broadcasts the new messages (or
    /// a clear), which `handle` applies like any other update.
    func chats() async throws -> [ChatSummary] { try await history("listChats") }
    func newChat() async throws -> [ChatSummary] {
        queue = []
        return try await history("newChat")
    }
    func openChat(_ id: String) async throws -> [ChatSummary] {
        queue = []
        return try await history("openChat", id)
    }
    func deleteChat(_ id: String) async throws -> [ChatSummary] { try await history("deleteChat", id) }

    private func history(_ method: String, _ id: String? = nil) async throws -> [ChatSummary] {
        try await socket.call(method, id.map { [JSONValue.string($0)] } ?? []).decoded(as: [ChatSummary].self)
    }

    func startNewChat() {
        Task {
            do { _ = try await newChat() } catch { errorText = error.localizedDescription }
        }
    }

    func respond(toApproval approvalID: String, approved: Bool) {
        guard let index = messages.lastIndex(where: { message in
            message.parts.contains { $0["approval"]?["id"]?.string == approvalID }
        }),
            let partIndex = messages[index].parts.firstIndex(where: {
                $0["approval"]?["id"]?.string == approvalID
            }),
            let callID = messages[index].parts[partIndex]["toolCallId"]?.string
        else { return }
        messages[index].parts[partIndex].set("state", .string("approval-responded"))
        status = .submitted
        socket.send(
            .object([
                "type": .string("cf_agent_tool_approval"),
                "toolCallId": .string(callID),
                "approved": .bool(approved),
                "autoContinue": .bool(true),
            ]))
    }

    // MARK: Socket events

    private func opened() {
        connected = true
        socket.send(
            .object([
                "type": .string("cf_agent_stream_resume_request"),
                "probeId": .string(randomID(length: 8)),
            ]))
    }

    private func closed() {
        connected = false
        // A closed socket may mean the session expired; checked at most
        // every 15 s so an offline phone doesn't hammer /auth/me.
        if Date().timeIntervalSince(lastAuthCheck) > 15 {
            lastAuthCheck = Date()
            onConnectionLost?()
        }
    }

    func handle(_ frame: JSONValue) {
        switch frame["type"]?.string {
        case "cf_agent_chat_messages":
            replaceMessages(with: frame["messages"]?.array ?? [])
        case "cf_agent_chat_clear":
            messages = []
            finishTurn()
        case "cf_agent_message_updated":
            if let message = frame["message"].flatMap(ChatMessage.init(json:)) { update(message) }
        case "cf_agent_stream_resuming":
            if let id = frame["id"]?.string {
                requestID = id
                socket.send(
                    .object(["type": .string("cf_agent_stream_resume_ack"), "id": .string(id)]))
            }
        case "cf_agent_use_chat_response":
            handleResponse(frame)
        case "cf_agent_mcp_servers":
            mcp = frame["mcp"].flatMap { try? $0.decoded(as: McpState.self) }
        case "reminder":
            if let text = frame["description"]?.string {
                present(Notice(icon: "⏰", title: "Reminder", text: text))
            }
        case "email":
            // Spam the assistant sorted out stays in the inbox without a banner.
            let category = frame["category"]?.string
            if let subject = frame["subject"]?.string, category != "ignore" {
                let from = frame["from"]?.string ?? "Someone"
                let sender = frame["trusted"]?.bool == false ? "\(from) (unknown sender)" : from
                let detail = frame["summary"]?.string ?? subject
                let action = category == "action"
                present(Notice(
                    icon: action ? "⚠️" : "📧",
                    title: action ? "Email needs action" : "New email",
                    text: "\(sender): \(detail)"
                ))
            }
        default:
            break
        }
    }

    private func present(_ notice: Notice) {
        self.notice = notice
        // In the foreground the banner in the app is enough.
        if UIApplication.shared.applicationState != .active {
            Reminders.notify(title: notice.title, body: notice.text)
        }
    }

    /// The server's list is the truth, except for the reply still streaming.
    private func replaceMessages(with json: [JSONValue]) {
        var incoming = json.compactMap(ChatMessage.init(json:))
        if let id = streamingMessageID, let local = messages.first(where: { $0.id == id }) {
            if let index = incoming.firstIndex(where: { $0.id == id }) {
                incoming[index] = local
            } else {
                incoming.append(local)
            }
        }
        messages = incoming
    }

    private func update(_ message: ChatMessage) {
        let toolIDs = Set(message.parts.compactMap { $0["toolCallId"]?.string })
        let index =
            messages.firstIndex { $0.id == message.id }
            ?? messages.firstIndex { existing in
                existing.parts.contains { part in
                    part["toolCallId"]?.string.map(toolIDs.contains) ?? false
                }
            }
        guard let index else { return }
        var updated = message
        updated.id = messages[index].id
        messages[index] = updated
    }

    private func handleResponse(_ frame: JSONValue) {
        let id = frame["id"]?.string ?? ""
        let replay = frame["replay"]?.bool == true
        let continuation = frame["continuation"]?.bool == true
        let seq = frame["seq"]?.number.map { Int($0) }

        if frame["error"]?.bool == true {
            errorText = frame["body"]?.string
            finishTurn()
            return
        }
        // A continuation replays chunks this client already applied.
        let alreadyApplied = replay && continuation && seq.map { $0 <= (appliedSeq[id] ?? -1) } == true
        if !alreadyApplied {
            if let seq { appliedSeq[id] = max(seq, appliedSeq[id] ?? -1) }
            if let body = frame["body"]?.string, !body.trimmingCharacters(in: .whitespaces).isEmpty,
                let chunk = JSONValue.parse(body)
            {
                apply(chunk, replay: replay, continuation: continuation)
            }
        }
        if frame["done"]?.bool == true {
            appliedSeq[id] = nil
            if status != .ready { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
            finishTurn()
        }
    }

    private func apply(_ chunk: JSONValue, replay: Bool, continuation: Bool) {
        switch chunk["type"]?.string {
        case "start":
            beginMessage(id: chunk["messageId"]?.string ?? randomID(), replay: replay, continuation: continuation)
        case "error":
            errorText = chunk["errorText"]?.string
        default:
            guard let id = streamingMessageID, let index = messages.firstIndex(where: { $0.id == id })
            else { return }
            if status != .streaming { status = .streaming }
            reducer.apply(chunk, to: &messages[index])
        }
    }

    private func beginMessage(id: String, replay: Bool, continuation: Bool) {
        reducer = ChunkReducer()
        streamingMessageID = id
        status = .streaming
        if let index = messages.firstIndex(where: { $0.id == id }) {
            // A resumed stream replays from its first chunk; rebuild the reply.
            if replay && !continuation { messages[index].parts = [] }
        } else {
            messages.append(ChatMessage(id: id, role: "assistant", parts: []))
        }
    }

    private func finishTurn() {
        status = .ready
        streamingMessageID = nil
        requestID = nil
        if !queue.isEmpty {
            let next = queue.removeFirst()
            dispatch(next.text, next.attachments)
        }
    }
}
