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

    /// Search stays tucked into the header until asked for, like the
    /// Claude app: tap the magnifier or pull the list down past `threshold`.
    @State private var searching = false
    /// How far the list is pulled down past its top, in points.
    @State private var overscroll: CGFloat = 0
    /// Where the iOS 17 marker sits at rest; the pull is measured from it.
    @State private var restY: CGFloat?
    private let threshold: CGFloat = 72
    private static let space = "history-list"

    private var pull: CGFloat {
        searching ? 0 : min(1, max(0, overscroll) / threshold)
    }

    var body: some View {
        VStack(spacing: 0) {
            HistoryHeader(
                query: $query, searching: $searching, pull: pull,
                onNew: {
                    Task {
                        if await perform({ try await store.newChat() }) {
                            onClose()
                        }
                    }
                },
                onClose: onClose
            )
            List {
                // iOS 17 has no scroll geometry: a zero-height marker's drop
                // from where it first rested measures the pull instead.
                Color.clear
                    .frame(height: 0)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .onGeometryChange(for: CGFloat.self) {
                        $0.frame(in: .named(Self.space)).minY
                    } action: { y in
                        if #unavailable(iOS 18) {
                            let rest = restY ?? y
                            restY = rest
                            overscroll = y - rest
                        }
                    }
                    .accessibilityHidden(true)
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
            .environment(\.defaultMinListRowHeight, 0)
            .coordinateSpace(.named(Self.space))
            .scrollDismissesKeyboard(.immediately)
            .overlay {
                if chats == nil, error == nil {
                    ProgressView()
                }
            }
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
            .onOverscroll { overscroll = $0 }
            .onPullReleased {
                if pull >= 1 {
                    openSearch()
                }
            }
            .onChange(of: pull >= 1) { _, armed in
                // Without scroll phases (iOS 17) there is no release to wait for.
                if #unavailable(iOS 18) {
                    if armed {
                        openSearch()
                    }
                }
            }
        }
        .task(id: Load(isOpen: isOpen, query: needle)) { await load() }
        .onChange(of: isOpen) {
            if !isOpen {
                query = ""
                searching = false
            }
        }
    }

    private func openSearch() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) { searching = true }
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

private extension View {
    /// Reports how far the scroll view is pulled down past its top (iOS 18+),
    /// straight from its content offset so insets can't skew it.
    @ViewBuilder
    func onOverscroll(_ action: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18, *) {
            onScrollGeometryChange(for: CGFloat.self) {
                -($0.contentOffset.y + $0.contentInsets.top)
            } action: { _, new in
                action(new)
            }
        } else {
            self
        }
    }

    /// Runs `action` when the finger lets go of the scroll view (iOS 18+;
    /// earlier versions have no scroll phases, so nothing happens).
    @ViewBuilder
    func onPullReleased(_ action: @escaping () -> Void) -> some View {
        if #available(iOS 18, *) {
            onScrollPhaseChange { old, new in
                if old == .interacting, new != .interacting {
                    action()
                }
            }
        } else {
            self
        }
    }
}
