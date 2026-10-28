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
        let store = ChatStore(token: { nil })
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
        let store = ChatStore(token: { nil })
        store.handle(response(id: "r", chunk: #"{"type":"start","messageId":"a"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-start","id":"t"}"#))
        store.handle(response(id: "r", chunk: #"{"type":"text-delta","id":"t","delta":"Hi"}"#))
        store.handle(frame(#"{"type":"cf_agent_chat_messages","messages":[{"id":"u","role":"user","parts":[]}]}"#))

        XCTAssertEqual(store.messages.map(\.id), ["u", "a"])
        XCTAssertEqual(store.messages[1].parts[0]["text"]?.string, "Hi")
    }
}

final class AttachmentTests: XCTestCase {
    func testTextFileIsInlinedAndShownAsAChip() throws {
        let attachment = try Attachment.make(name: "notes.csv", data: Data("a,b\n1,2".utf8))
        let message = ChatMessage.user(text: "Summarise", attachments: [attachment])

        XCTAssertEqual(message.plainText, "Summarise")
        XCTAssertEqual(message.attachmentNames, ["notes.csv"])
        XCTAssertTrue(message.parts[0]["text"]?.string?.contains("a,b\n1,2") == true)
    }

    func testUnsupportedFileIsRejected() {
        XCTAssertThrowsError(try Attachment.make(name: "archive.zip", data: Data([0, 1])))
    }

    func testTotalSizeIsCapped() throws {
        let big = Data(repeating: 0x61, count: Attachment.maxTotalBytes + 1)
        let attachment = try Attachment.make(name: "big.txt", data: big)
        XCTAssertThrowsError(try Attachment.check([attachment]))
    }
}

final class ChatSummaryTests: XCTestCase {
    func testDecodesTheServersList() throws {
        let json = JSONValue.parse(
            #"[{"id":"a","title":"Hello","updatedAt":"2026-10-28T04:41:34.123Z","active":true}]"#)
        let chats = try XCTUnwrap(json).decoded(as: [ChatSummary].self)

        XCTAssertEqual(chats.map(\.title), ["Hello"])
        XCTAssertTrue(chats[0].active)
    }
}
