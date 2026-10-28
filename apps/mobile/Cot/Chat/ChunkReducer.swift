import Foundation

/// Applies AI SDK UI message stream chunks (`text-delta`, `tool-input-available`,
/// …) to the assistant message they build. Pure, so it is unit-tested.
struct ChunkReducer {
    /// Open text/reasoning parts by chunk id → index into `message.parts`.
    private var open: [String: Int] = [:]

    mutating func apply(_ chunk: JSONValue, to message: inout ChatMessage) {
        guard let type = chunk["type"]?.string else { return }
        switch type {
        case "text-start", "reasoning-start":
            let kind = type == "text-start" ? "text" : "reasoning"
            message.parts.append(
                .object([
                    "type": .string(kind), "text": .string(""), "state": .string("streaming"),
                ]))
            if let id = chunk["id"]?.string {
                open["\(kind):\(id)"] = message.parts.count - 1
            }
        case "text-delta", "reasoning-delta":
            let kind = type == "text-delta" ? "text" : "reasoning"
            guard let id = chunk["id"]?.string, let index = open["\(kind):\(id)"],
                let delta = chunk["delta"]?.string
            else { return }
            let current = message.parts[index]["text"]?.string ?? ""
            message.parts[index].set("text", .string(current + delta))
        case "text-end", "reasoning-end":
            let kind = type == "text-end" ? "text" : "reasoning"
            guard let id = chunk["id"]?.string, let index = open["\(kind):\(id)"] else { return }
            message.parts[index].set("state", .string("done"))
            open["\(kind):\(id)"] = nil
        case "tool-input-start", "tool-input-available", "tool-input-error":
            upsertTool(chunk, type: type, in: &message)
        case "tool-approval-request":
            update(chunk, in: &message) { part in
                part.set("state", .string("approval-requested"))
                part.set("approval", .object(["id": chunk["approvalId"] ?? .null]))
            }
        case "tool-output-available":
            update(chunk, in: &message) { part in
                part.set("state", .string("output-available"))
                part.set("output", chunk["output"] ?? .null)
            }
        case "tool-output-error":
            update(chunk, in: &message) { part in
                part.set("state", .string("output-error"))
                part.set("errorText", chunk["errorText"] ?? .string(""))
            }
        case "tool-output-denied":
            update(chunk, in: &message) { $0.set("state", .string("output-denied")) }
        default:
            break  // start/finish/step markers, sources, data parts
        }
    }

    private func upsertTool(_ chunk: JSONValue, type: String, in message: inout ChatMessage) {
        guard let callID = chunk["toolCallId"]?.string, let name = chunk["toolName"]?.string
        else { return }
        let state: String =
            switch type {
            case "tool-input-start": "input-streaming"
            case "tool-input-available": "input-available"
            default: "output-error"
            }
        let isDynamic = chunk["dynamic"]?.bool == true
        var part =
            message.partIndex(toolCallID: callID).map { message.parts[$0] }
            ?? .object([
                "type": .string(isDynamic ? "dynamic-tool" : "tool-\(name)"),
                "toolCallId": .string(callID),
            ])
        if isDynamic { part.set("toolName", .string(name)) }
        part.set("state", .string(state))
        if let input = chunk["input"] { part.set("input", input) }
        if type == "tool-input-error" {
            part.set("errorText", chunk["errorText"] ?? .string(""))
        }
        if let index = message.partIndex(toolCallID: callID) {
            message.parts[index] = part
        } else {
            message.parts.append(part)
        }
    }

    private func update(
        _ chunk: JSONValue, in message: inout ChatMessage, _ change: (inout JSONValue) -> Void
    ) {
        guard let callID = chunk["toolCallId"]?.string, let index = message.partIndex(toolCallID: callID)
        else { return }
        change(&message.parts[index])
    }
}
