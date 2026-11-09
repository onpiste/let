@testable import Cot
import XCTest

@MainActor
final class ReplyQuoteTests: XCTestCase {
    func testQuotesAnAssistantAnswer() throws {
        let message = ChatMessage(
            id: "a1", role: "assistant",
            parts: [.object(["type": .string("text"), "text": .string(" Paris is the capital. ")])]
        )
        let quote = try XCTUnwrap(ReplyQuote(message: message))
        XCTAssertEqual(quote.id, "a1")
        XCTAssertTrue(quote.isAssistant)
        XCTAssertEqual(quote.text, "Paris is the capital.")
    }

    func testEmptyMessageCannotBeQuoted() {
        XCTAssertNil(ReplyQuote(message: ChatMessage(id: "a", role: "assistant", parts: [])))
    }

    func testLongTextIsClipped() throws {
        let quote = try XCTUnwrap(
            ReplyQuote(id: "a", role: "user", text: String(repeating: "x", count: 10000))
        )
        XCTAssertEqual(quote.text.count, ReplyQuote.maxCharacters)
    }

    func testReplyTravelsInMetadata() throws {
        let quote = try XCTUnwrap(ReplyQuote(id: "a1", role: "assistant", text: "Paris"))
        let message = ChatMessage.user(text: "Why?", attachments: [], replyTo: quote)
        XCTAssertEqual(message.replyTo, quote)
        XCTAssertNotNil(message.createdAt)
        // The same JSON the web client sends (metadata.replyTo).
        let decoded = try XCTUnwrap(ChatMessage(json: message.json))
        XCTAssertEqual(decoded.replyTo, quote)
    }

    func testQueuedReplyKeepsItsQuote() throws {
        let store = ChatStore(token: { nil })
        let quote = try XCTUnwrap(ReplyQuote(id: "a1", role: "assistant", text: "Paris"))
        store.send("Why?", replyTo: quote)
        XCTAssertEqual(store.messages.last?.replyTo, quote)
        // While that turn runs, the next reply waits in the queue with its quote.
        store.send("And Lyon?", replyTo: quote)
        XCTAssertEqual(store.queue.first?.replyTo, quote)
    }
}
