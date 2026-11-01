import SwiftUI

/// Conversations in the side drawer: search them, tap to open one, swipe to
/// delete, or start a new one. A chat whose reply is still running says so;
/// switching away never stops it. Mirrors `history-panel.tsx`.
struct HistoryView: View {
    let store: ChatStore
    /// Whether the drawer is showing; the list reloads each time it opens.
    let isOpen: Bool
    let onClose: () -> Void

    @State private var chats: [ChatSummary]?
    @State private var error: String?
    @State private var query = ""

    private var needle: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if chats?.isEmpty == true {
                    Text(needle.isEmpty ? "No conversations yet." : "No matching chats.")
                        .foregroundStyle(.secondary)
                }
                ForEach(chats ?? []) { chat in
                    row(chat)
                }
            }
            .listStyle(.plain)
            .overlay {
                if chats == nil, error == nil {
                    ProgressView()
                }
            }
            .searchable(
                text: $query, placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search chats"
            )
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("New chat", systemImage: "square.and.pencil") {
                        Task {
                            if await perform({ try await store.newChat() }) {
                                onClose()
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark", action: onClose)
                }
            }
            .task(id: Load(isOpen: isOpen, query: needle)) { await load() }
            .onChange(of: isOpen) {
                if !isOpen {
                    query = ""
                }
            }
        }
    }

    private func row(_ chat: ChatSummary) -> some View {
        Button {
            store.openChat(chat.id)
            onClose()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(chat.title).lineLimit(1)
                if let snippet = chat.snippet, !snippet.isEmpty {
                    Text(snippet).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack(spacing: 4) {
                    if chat.running {
                        Text("Answering… ·").fontWeight(.semibold).foregroundStyle(.tint)
                    }
                    Text(chat.updatedAt.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(.secondary)
                }
                .font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .foregroundStyle(.primary)
        // No dividers between chats, like the web list.
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(chat.id == store.chatID ? Color(.secondarySystemBackground) : nil)
        .swipeActions {
            Button("Delete", role: .destructive) {
                Task {
                    _ = await run {
                        let all = try await store.deleteChat(chat.id)
                        // Keep showing the search results, minus this one.
                        return needle.isEmpty ? all : (chats ?? []).filter { $0.id != chat.id }
                    }
                }
            }
        }
    }

    private struct Load: Equatable {
        let isOpen: Bool
        let query: String
    }

    /// Every chat, or the matches once typing pauses; nothing while closed.
    private func load() async {
        guard isOpen else { return }
        let query = needle
        if query.isEmpty {
            _ = await run { try await store.chats() }
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        _ = await run { try await store.searchChats(query) }
    }

    /// Runs a call that switches chats; false (with the error shown) on failure.
    private func perform(_ action: () async throws -> Void) async -> Bool {
        do {
            try await action()
            error = nil
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    /// Runs a history call and shows the list it returns; false on failure.
    private func run(_ action: () async throws -> [ChatSummary]) async -> Bool {
        do {
            chats = try await action()
            error = nil
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}
