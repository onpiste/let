import Foundation

/// One email in the inbox (EmailSummary in @cot/shared email.ts); `body`,
/// `date` and `attachments` are only there once opened (EmailDetail).
struct InboxEmail: Decodable, Identifiable, Equatable {
    let id: Int
    let receivedAt: String
    let from: String
    /// From the owner or a trusted sender rather than a stranger.
    let trusted: Bool
    let subject: String
    /// `action`, `notify` or `ignore`; nil until the assistant has sorted it.
    let category: String?
    let summary: String?
    let read: Bool
    let archived: Bool
    let body: String?
    let attachments: [String]?

    var categoryLabel: String? {
        switch category {
        case "action": "Needs action"
        case "notify": "FYI"
        case "ignore": "Low priority"
        default: nil
        }
    }

    var senderText: String {
        trusted ? from : "\(from) · unknown sender"
    }

    /// The server stores SQLite's `YYYY-MM-DD HH:MM:SS` in UTC; today shows
    /// the time, older mail the date (lib/inbox.ts `receivedText`).
    var receivedText: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        guard let date = formatter.date(from: receivedAt) else { return receivedAt }
        return Calendar.current.isDateInToday(date)
            ? date.formatted(date: .omitted, time: .shortened)
            : date.formatted(.dateTime.month(.abbreviated).day())
    }
}

/// A page of the inbox or the archive (InboxPage in @cot/shared).
struct InboxPage: Decodable {
    let emails: [InboxEmail]
    let more: Bool
    let unread: Int
}
