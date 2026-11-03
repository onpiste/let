import SwiftUI

/// Conversations in the side drawer: search them, tap to open one, swipe to
/// rename or delete one, or start a new one. A chat whose reply is still running says so;
/// switching away never stops it. Mirrors `history-panel.tsx`.
struct HistoryView: View {
    let store: ChatStore
    /// Whether the drawer is showing; the list reloads each time it opens.
    let isOpen: Bool
    let onClose: () -> Void

    @State private var chats: [ChatSummary]?
    @State private var error: String?
    @State private var query = ""
    /// The cursor of the page after the ones shown; nil when all are.
    @State private var next: String?
    @State private var loadingMore = false
    /// The chat whose title is being edited.
    @State private var renaming: ChatSummary?
    @State private var newTitle = ""

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
                // Loads the next page as the end scrolls into view
                // (history-more.tsx on the web).
                if next != nil {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .listRowSeparator(.hidden)
                        .onAppear { Task { await more() } }
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
            .alert(
                "Rename conversation",
                isPresented: Binding(
                    get: { renaming != nil },
                    set: { if !$0 { renaming = nil } }
                )
            ) {
                TextField("Title", text: $newTitle)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Save") { Task { await rename() } }
            }
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
        // Delete stays first, so a full swipe still deletes.
        .swipeActions {
            Button("Delete", role: .destructive) {
                Task {
                    if await perform({ try await store.deleteChat(chat.id) }) {
                        chats = chats?.filter { $0.id != chat.id }
                    }
                }
            }
            Button("Rename", systemImage: "pencil") {
                newTitle = chat.title
                renaming = chat
            }
            .tint(.blue)
        }
    }

    private struct Load: Equatable {
        let isOpen: Bool
        let query: String
    }

    /// The newest chats, or the matches once typing pauses; nothing while
    /// closed.
    private func load() async {
        next = nil
        guard isOpen else { return }
        let query = needle
        if query.isEmpty {
            do {
                let page = try await store.chats()
                guard !Task.isCancelled else { return }
                chats = page.chats
                next = page.next
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        _ = await run { try await store.searchChats(query) }
    }

    /// Saves the title typed in the rename alert (web: history-panel.tsx).
    private func rename() async {
        guard let chat = renaming else { return }
        renaming = nil
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != chat.title else { return }
        if await perform({ try await store.renameChat(chat.id, title: title) }) {
            chats = chats?.map { item in
                var copy = item
                if copy.id == chat.id {
                    copy.title = title
                }
                return copy
            }
        }
    }

    /// The page after the ones shown, added below them, once at a time.
    private func more() async {
        guard let cursor = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await store.chats(after: cursor)
            // The query changed meanwhile and the list was reloaded.
            guard next == cursor, needle.isEmpty else { return }
            chats = (chats ?? []).appending(page.chats)
            next = page.next
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Runs a call that switches or deletes chats; false (with the error shown) on failure.
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
