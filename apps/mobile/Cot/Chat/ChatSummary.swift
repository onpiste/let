import Foundation

/// One conversation in the history list (ChatSummary in @cot/shared chats.ts).
struct ChatSummary: Decodable, Identifiable, Equatable {
    let id: String
    /// Changed in place after `renameChat`.
    var title: String
    let updatedAt: Date
    /// The chat last written in from any client; Telegram talks into it.
    let active: Bool
    /// The assistant is still answering in this chat.
    let running: Bool
    /// From `searchChats`: the text around the first match.
    let snippet: String?

    private enum Keys: String, CodingKey { case id, title, updatedAt, active, running, snippet }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        active = try c.decode(Bool.self, forKey: .active)
        running = try c.decodeIfPresent(Bool.self, forKey: .running) ?? false
        snippet = try c.decodeIfPresent(String.self, forKey: .snippet)
        let iso = try c.decode(String.self, forKey: .updatedAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        updatedAt = formatter.date(from: iso) ?? Date()
    }
}

/// One page of the history list (ChatPage in @cot/shared chats.ts): pass
/// `next` back to `listChats` for the page after it; nil on the last one.
struct ChatPage: Decodable {
    let chats: [ChatSummary]
    let next: String?
}

extension [ChatSummary] {
    /// Adds a page, keeping the copy of a chat already shown (it moves to
    /// the top when written in while the user scrolls). `appendChats` in TS.
    func appending(_ page: [ChatSummary]) -> [ChatSummary] {
        let seen = Set(map(\.id))
        return self + page.filter { !seen.contains($0.id) }
    }
}
