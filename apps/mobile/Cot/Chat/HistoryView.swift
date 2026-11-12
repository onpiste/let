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
