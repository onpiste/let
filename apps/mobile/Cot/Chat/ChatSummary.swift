import Foundation

/// One conversation in the history list (ChatSummary in @cot/shared chats.ts).
struct ChatSummary: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let updatedAt: Date
    let active: Bool
    /// From `searchChats`: the text around the first match.
    let snippet: String?

    private enum Keys: String, CodingKey { case id, title, updatedAt, active, snippet }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        active = try c.decode(Bool.self, forKey: .active)
        snippet = try c.decodeIfPresent(String.self, forKey: .snippet)
        let iso = try c.decode(String.self, forKey: .updatedAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        updatedAt = formatter.date(from: iso) ?? Date()
    }
}
