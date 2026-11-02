import Foundation

/// The conversations (AssistantRpc listChats / currentChat / newChat /
/// openChat / deleteChat / searchChats). Each chat is its own agent on the
/// server, so opening another one never stops a reply that is still running.
extension ChatStore {
    /// The newest chats, a page at a time: nil for the first page, then the
    /// `next` of the page before.
    func chats(after cursor: String? = nil) async throws -> ChatPage {
        try await socket.call("listChats", [cursor.map { .string($0) } ?? .null])
            .decoded(as: ChatPage.self)
    }

    /// The chat to open on start: the one last used, or a new empty one.
    func currentChat() async throws -> String {
        try await socket.call("currentChat").decoded(as: String.self)
    }

    func newChat() async throws {
        let id = try await socket.call("newChat").decoded(as: String.self)
        show(chat: id)
    }

    /// Shows the chat at once; marking it as the one in use (which Telegram
    /// follows) happens in the background, so the switch never waits on it.
    func openChat(_ id: String) {
        show(chat: id)
        Task {
            do { _ = try await socket.call("openChat", [.string(id)]) } catch {
                report(error.localizedDescription)
            }
        }
    }

    func deleteChat(_ id: String) async throws {
        _ = try await socket.call("deleteChat", [.string(id)])
        // The open chat is gone: show the one the server picks next.
        if id == chatID {
            try await show(chat: currentChat())
        }
    }

    /// Chats whose title or text contains `query`, each with a snippet.
    func searchChats(_ query: String) async throws -> [ChatSummary] {
        try await socket.call("searchChats", [.string(query)])
            .decoded(as: [ChatSummary].self)
    }

    func startNewChat() {
        Task {
            do { try await newChat() } catch { report(error.localizedDescription) }
        }
    }
}
