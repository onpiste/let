@testable import Cot
import XCTest

@MainActor
final class DevLogTests: XCTestCase {
    func testEncodesTheSharedLogEntryShape() throws {
        let log = DevLog()
        log.apply(enabled: true)
        log.add("warn", "socket", "Socket closed", ["path": "/chat"])
        let entry = try XCTUnwrap(log.queue.first)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any]
        )
        XCTAssertEqual(json["level"] as? String, "warn")
        XCTAssertEqual(json["source"] as? String, "ios")
        XCTAssertEqual(json["scope"] as? String, "socket")
        XCTAssertEqual((json["data"] as? [String: String])?["path"], "/chat")
        XCTAssertNotNil(ISO8601DateFormatter.withFractions.date(from: entry.ts))
    }

    func testDropsLinesWhenDeveloperModeIsOff() {
        let log = DevLog()
        log.add("info", "app", "Before status", nil)
        XCTAssertEqual(log.queue.count, 1)
        log.apply(enabled: false)
        log.add("info", "app", "After status", nil)
        XCTAssertTrue(log.queue.isEmpty)
    }
}

private extension ISO8601DateFormatter {
    static let withFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
