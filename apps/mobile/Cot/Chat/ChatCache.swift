import Foundation

/// The last conversation and its id, kept on disk so the chat opens on it at once
/// instead of waiting for the socket. The server stays the truth: its list
/// replaces this one as soon as it arrives. Tagged with the user so another
/// account never sees it, and wiped on sign-out.
enum ChatCache {
    private static var url: URL {
        URL.cachesDirectory.appending(path: "last-chat.json")
    }

    struct Entry {
        let chatID: String
        let messages: [ChatMessage]
    }

    static func load(userID: String) -> Entry? {
        guard let data = try? Data(contentsOf: url),
              let root = JSONValue.parse(String(decoding: data, as: UTF8.self)),
              root["user"]?.string == userID,
              let chatID = root["chatId"]?.string
        else { return nil }
        let messages = (root["messages"]?.array ?? []).compactMap(ChatMessage.init(json:))
        return Entry(chatID: chatID, messages: messages)
    }

    static func save(_ messages: [ChatMessage], chatID: String, userID: String) {
        let root = JSONValue.object([
            "user": .string(userID),
            "chatId": .string(chatID),
            "messages": .array(messages.map(\.json))
        ])
        try? Data(root.serialized().utf8).write(to: url, options: .atomic)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: url)
    }
}
