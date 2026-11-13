import Foundation

/// The reply being streamed in `cf_agent_use_chat_response` frames: which
/// message it writes into, the chunks already applied (a resumed stream
/// replays them) and the reducer folding chunks into the message. ChatStore
/// owns one and acts on the `Outcome` of each frame.
struct ReplyStream {
    /// What a frame means for the turn.
    struct Outcome {
        /// The reply started or grew, so the turn is streaming.
        var streaming = false
        /// The frame reported an error; its text may be missing.
        var failed = false
        var errorText: String?
        /// The request failed on the server; the turn is over.
        var aborted = false
        /// The stream ended; the turn is over.
        var done = false
    }

    /// The message the chunks go into; nil when no reply is streaming.
    private(set) var messageID: String?
    private var reducer = ChunkReducer()
    private var appliedSeq: [String: Int] = [:]

    /// Stops writing into the reply; the next `start` chunk begins a new one.
    mutating func end() {
        messageID = nil
    }

    mutating func receive(_ frame: JSONValue, into messages: inout [ChatMessage]) -> Outcome {
        var outcome = Outcome()
        if frame["error"]?.bool == true {
            outcome.failed = true
            outcome.errorText = frame["body"]?.string
            outcome.aborted = true
            return outcome
        }
        let id = frame["id"]?.string ?? ""
        let replay = frame["replay"]?.bool == true
        let continuation = frame["continuation"]?.bool == true
        let seq = frame["seq"]?.number.map { Int($0) }
        // A continuation replays chunks this client already applied.
        let alreadyApplied = replay && continuation && seq
            .map { $0 <= (appliedSeq[id] ?? -1) } == true
        if !alreadyApplied {
            if let seq {
                appliedSeq[id] = max(seq, appliedSeq[id] ?? -1)
            }
            if let body = frame["body"]?.string, !body.trimmingCharacters(in: .whitespaces).isEmpty,
               let chunk = JSONValue.parse(body)
            {
                apply(chunk, replay: replay, continuation: continuation, to: &messages, &outcome)
            }
        }
        if frame["done"]?.bool == true {
            appliedSeq[id] = nil
            outcome.done = true
        }
        return outcome
    }

    private mutating func apply(
        _ chunk: JSONValue,
        replay: Bool,
        continuation: Bool,
        to messages: inout [ChatMessage],
        _ outcome: inout Outcome
    ) {
        switch chunk["type"]?.string {
        case "start":
            let id = chunk["messageId"]?.string ?? randomID()
            begin(id: id, replay: replay, continuation: continuation, in: &messages)
            outcome.streaming = true
            if let index = messages.firstIndex(where: { $0.id == id }) {
                messages[index].stamp(with: chunk["messageMetadata"])
            }
        case "error":
            outcome.failed = true
            outcome.errorText = chunk["errorText"]?.string
        default:
            guard let messageID,
                  let index = messages.firstIndex(where: { $0.id == messageID })
            else { return }
            outcome.streaming = true
            reducer.apply(chunk, to: &messages[index])
        }
    }

    private mutating func begin(
        id: String, replay: Bool, continuation: Bool, in messages: inout [ChatMessage]
    ) {
        reducer = ChunkReducer()
        messageID = id
        if let index = messages.firstIndex(where: { $0.id == id }) {
            // A resumed stream replays from its first chunk; rebuild the reply.
            if replay, !continuation {
                messages[index].parts = []
            }
        } else {
            messages.append(ChatMessage(id: id, role: "assistant", parts: []))
        }
    }
}
