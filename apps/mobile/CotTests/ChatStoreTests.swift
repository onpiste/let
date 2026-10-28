import XCTest

@testable import Cot

@MainActor
final class ChatStoreTests: XCTestCase {
    private func frame(_ text: String) -> JSONValue {
        JSONValue.parse(text) ?? .null
    }

    private func response(id: String, chunk: String, done: Bool = false) -> JSONValue {
        .object([
            "type": .string("cf_agent_use_chat_response"),
            "id": .string(id),
            "body": .string(chunk),
            "done": .bool(done),
        ])
    }

    func testStreamedReplyBecomesAnAssistantMessage() {
        let store = ChatStore(harness: .think, token: { nil })
        store.handle(frame(#"{"type":"cf_agent_chat_messages","messages":[{"id":"u","role":"user","parts":[{"type":"text","text":"hi"}]}]}"#))
        store.handle(response(id: "r", chunk: #"{"type":"start","messageId":"a"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-start","id":"t"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-delta","id":"t","delta":"Hello"}"#))
        XCTAssertEqual(store.status, .streaming)
        store.handle(response(id: "r", chunk: "", done: true))

        XCTAssertEqual(store.status, .ready)
        XCTAssertEqual(store.messages.map(\.id), ["u", "a"])
        XCTAssertEqual(store.messages[1].parts[0]["text"]?.string, "Hello")
    }

    func testServerListKeepsTheReplyThatIsStillStreaming() {
        let store = ChatStore(harness: .think, token: { nil })
        store.handle(response(id: "r", chunk: #"{"type":"start","messageId":"a"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-start","id":"t"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-delta","id":"t","delta":"Hi"}"#))
        store.handle(frame(#"{"type":"cf_agent_chat_messages","messages":[{"id":"u","role":"user","parts":[]}]}"#))

        XCTAssertEqual(store.messages.map(\.id), ["u", "a"])
        XCTAssertEqual(store.messages[1].parts[0]["text"]?.string, "Hi")
    }
}
