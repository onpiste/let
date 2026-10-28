import Foundation

/// An AI SDK `UIMessage`. The parts stay as raw JSON (see `JSONValue`) so the
/// whole conversation can be sent back to the server unchanged; the accessors
/// below read what the UI needs.
struct ChatMessage: Identifiable, Equatable, Sendable {
    var id: String
    var role: String
    var parts: [JSONValue]
    /// Fields besides id/role/parts (e.g. metadata), kept for the round trip.
    var extra: [String: JSONValue] = [:]

    init(id: String, role: String, parts: [JSONValue], extra: [String: JSONValue] = [:]) {
        self.id = id
        self.role = role
        self.parts = parts
        self.extra = extra
    }

    init?(json: JSONValue) {
        guard let object = json.object, let id = object["id"]?.string,
              let role = object["role"]?.string
        else { return nil }
        self.id = id
        self.role = role
        parts = object["parts"]?.array ?? []
        var extra = object
        for key in ["id", "role", "parts"] {
            extra[key] = nil
        }
        self.extra = extra
    }

    var json: JSONValue {
        var object = extra
        object["id"] = .string(id)
        object["role"] = .string(role)
        object["parts"] = .array(parts)
        return .object(object)
    }

    static func user(text: String, attachments: [Attachment]) -> ChatMessage {
        var parts = attachments.map(\.part)
        if !text.isEmpty {
            parts.append(.object(["type": .string("text"), "text": .string(text)]))
        }
        return ChatMessage(id: randomID(), role: "user", parts: parts)
    }

    var isUser: Bool {
        role == "user"
    }

    // The pattern is a constant, so compiling it cannot fail.
    // swiftlint:disable:next force_try
    private static let inlineFile = try! NSRegularExpression(
        pattern: "<file name=\"([^\"]*)\">\\n[\\s\\S]*?\\n</file>\\n?"
    )

    private var rawText: String {
        parts.compactMap { $0["type"]?.string == "text" ? $0["text"]?.string : nil }.joined()
    }

    /// The text a user typed, without the files inlined into it.
    var plainText: String {
        let text = rawText
        let range = NSRange(text.startIndex..., in: text)
        return Self.inlineFile.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Names of the files attached to a user message.
    var attachmentNames: [String] {
        let text = rawText
        let inline = Self.inlineFile.matches(in: text, range: NSRange(text.startIndex..., in: text))
            .compactMap { Range($0.range(at: 1), in: text).map { String(text[$0]) } }
        let files = parts.compactMap {
            $0["type"]?.string == "file" ? ($0["filename"]?.string ?? "file") : nil
        }
        return files + inline
    }

    var items: [MessageItem] {
        parts.enumerated().compactMap { index, part -> MessageItem? in
            guard let type = part["type"]?.string else { return nil }
            let id = "\(id)#\(index)"
            switch type {
            case "text":
                return .text(id: id, part["text"]?.string ?? "")
            case "reasoning":
                return .reasoning(
                    id: id, text: part["text"]?.string ?? "",
                    streaming: part["state"]?.string == "streaming"
                )
            case "dynamic-tool":
                return ToolCall(part: part, name: part["toolName"]?.string ?? "tool").map {
                    .tool(id: id, $0)
                }
            case _ where type.hasPrefix("tool-"):
                return ToolCall(part: part, name: String(type.dropFirst(5)))
                    .map { .tool(id: id, $0) }
            default:
                return nil
            }
        }
    }

    func partIndex(toolCallID: String) -> Int? {
        parts.firstIndex { $0["toolCallId"]?.string == toolCallID }
    }
}

enum MessageItem: Identifiable {
    case text(id: String, String)
    case reasoning(id: String, text: String, streaming: Bool)
    case tool(id: String, ToolCall)

    var id: String {
        switch self {
        case let .text(id, _), let .reasoning(id, _, _), let .tool(id, _): id
        }
    }
}

struct ToolCall: Equatable {
    enum State: String {
        case inputStreaming = "input-streaming"
        case inputAvailable = "input-available"
        case approvalRequested = "approval-requested"
        case approvalResponded = "approval-responded"
        case outputAvailable = "output-available"
        case outputError = "output-error"
        case outputDenied = "output-denied"
    }

    let callID: String
    let name: String
    let state: State
    let input: JSONValue?
    let approvalID: String?

    init?(part: JSONValue, name: String) {
        guard let callID = part["toolCallId"]?.string else { return nil }
        self.callID = callID
        self.name = name
        state = part["state"]?.string.flatMap(State.init(rawValue:)) ?? .inputAvailable
        input = part["input"]
        approvalID = part["approval"]?["id"]?.string
    }

    var isDone: Bool {
        state == .outputAvailable
    }

    var awaitsApproval: Bool {
        state == .approvalRequested && approvalID != nil
    }

    /// The first argument worth showing next to the tool's name.
    var detail: String {
        for key in ["command", "path", "content", "description"] {
            if let text = input?[key]?.string, !text.isEmpty {
                return text
            }
        }
        return ""
    }
}

func randomID(length: Int = 16) -> String {
    let alphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    return String((0 ..< length).compactMap { _ in alphabet.randomElement() })
}
