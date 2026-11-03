@testable import Cot
import XCTest

@MainActor
final class InboxTests: XCTestCase {
    func testDecodesAListedEmailWithoutBody() throws {
        let json = JSONValue.parse(
            #"{"emails":[{"id":3,"receivedAt":"2026-11-03 18:02:43","from":"a@b.c","trusted":false,"subject":"Hi","category":"action","summary":"Pay it","read":false,"archived":false}],"more":true,"unread":2}"#
        ) ?? .null
        let page = try json.decoded(as: InboxPage.self)
        XCTAssertEqual(page.unread, 2)
        XCTAssertTrue(page.more)
        let email = try XCTUnwrap(page.emails.first)
        XCTAssertEqual(email.id, 3)
        XCTAssertNil(email.body)
        XCTAssertEqual(email.categoryLabel, "Needs action")
        XCTAssertEqual(email.senderText, "a@b.c · unknown sender")
    }

    func testEmailEventsUpdateTheBadge() {
        let store = ChatStore(token: { nil })
        store.handleNotice(JSONValue.parse(#"{"type":"inbox","unread":4}"#) ?? .null)
        XCTAssertEqual(store.unreadEmails, 4)
        store.handleNotice(
            JSONValue.parse(
                #"{"type":"email","id":9,"unread":5,"from":"a@b.c","subject":"Hi","trusted":true,"category":"notify","timestamp":"t"}"#
            ) ?? .null
        )
        XCTAssertEqual(store.unreadEmails, 5)
        XCTAssertEqual(store.notice?.emailID, 9)
    }

    func testPushPathOpensOnlyInboxEmails() {
        Push.pendingEmail = nil
        Push.open(path: "/tasks")
        XCTAssertNil(Push.pendingEmail)
        Push.open(path: "/inbox/12")
        XCTAssertEqual(Push.pendingEmail, 12)
        Push.pendingEmail = nil
    }
}
