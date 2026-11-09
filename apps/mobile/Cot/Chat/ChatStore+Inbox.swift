import Foundation

/// The inbox calls of AssistantRpc (listInbox / openEmail / archiveEmail /
/// markAllEmailsRead / askAboutEmail) and the unread badge. Mirrors use-unread-emails.ts and
/// inbox-page.tsx.
extension ChatStore {
    func inbox(archived: Bool, offset: Int = 0) async throws -> InboxPage {
        let page = try await socket.call("listInbox", [.bool(archived), .number(Double(offset))])
            .decoded(as: InboxPage.self)
        unreadEmails = page.unread
        return page
    }

    /// The email, marked read; nil if it is gone.
    func openEmail(_ id: Int) async throws -> InboxEmail? {
        try await socket.call("openEmail", [.number(Double(id))])
            .decoded(as: InboxEmail?.self)
    }

    func archiveEmail(_ id: Int, archived: Bool) async throws {
        _ = try await socket.call("archiveEmail", [.number(Double(id)), .bool(archived)])
    }

    func markAllEmailsRead() async throws {
        _ = try await socket.call("markAllEmailsRead")
    }

    /// Starts a chat in which the assistant reads the email, and shows it.
    func askAboutEmail(_ id: Int) async throws {
        let chat = try await socket.call("askAboutEmail", [.number(Double(id))])
            .decoded(as: String.self)
        show(chat: chat)
    }

    /// On every (re)connect; email may be off on this deployment, so a
    /// failure just leaves the badge empty.
    func loadUnreadEmails() {
        Task { _ = try? await inbox(archived: false) }
    }

    /// `email` and `inbox` events carry the new count.
    func handleUnread(_ frame: JSONValue) {
        if let unread = frame["unread"]?.number {
            unreadEmails = Int(unread)
        }
    }
}
