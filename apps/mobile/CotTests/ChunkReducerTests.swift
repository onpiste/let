import XCTest

@testable import Cot

final class ChunkReducerTests: XCTestCase {
    private func chunk(_ text: String) -> JSONValue {
        JSONValue.parse(text) ?? .null
    }

    func testStreamsTextIntoOnePart() {
        var message = ChatMessage(id: "a", role: "assistant", parts: [])
        var reducer = ChunkReducer()
        for text in [
            #"{"type":"text-start","id":"t1"}"#,
            #"{"type":"text-delta","id":"t1","delta":"Hel"}"#,
            #"{"type":"text-delta","id":"t1","delta":"lo"}"#,
            #"{"type":"text-end","id":"t1"}"#,
        ] {
            reducer.apply(chunk(text), to: &message)
        }
        XCTAssertEqual(message.parts.count, 1)
        XCTAssertEqual(message.parts[0]["text"]?.string, "Hello")
        XCTAssertEqual(message.parts[0]["state"]?.string, "done")
    }

    func testToolLifecycleAndApproval() {
        var message = ChatMessage(id: "a", role: "assistant", parts: [])
        var reducer = ChunkReducer()
        for text in [
            #"{"type":"tool-input-start","toolCallId":"c1","toolName":"runCommand"}"#,
            #"{"type":"tool-input-available","toolCallId":"c1","toolName":"runCommand","input":{"command":"ls"}}"#,
            #"{"type":"tool-approval-request","toolCallId":"c1","approvalId":"ap1"}"#,
        ] {
            reducer.apply(chunk(text), to: &message)
        }
        guard case .tool(_, let call) = message.items.first else {
            return XCTFail("expected a tool item")
        }
        XCTAssertEqual(call.name, "runCommand")
        XCTAssertEqual(call.detail, "ls")
        XCTAssertTrue(call.awaitsApproval)
        XCTAssertEqual(call.approvalID, "ap1")

        reducer.apply(chunk(#"{"type":"tool-output-available","toolCallId":"c1","output":"ok"}"#), to: &message)
        guard case .tool(_, let done) = message.items.first else {
            return XCTFail("expected a tool item")
        }
        XCTAssertTrue(done.isDone)
        XCTAssertEqual(message.parts.count, 1)
    }

    func testMessageRoundTripKeepsUnknownFields() throws {
        let json = chunk(#"{"id":"m","role":"user","parts":[{"type":"text","text":"hi"}],"metadata":{"k":1}}"#)
        let message = try XCTUnwrap(ChatMessage(json: json))
        XCTAssertEqual(message.plainText, "hi")
        XCTAssertEqual(message.json, json)
    }
}
