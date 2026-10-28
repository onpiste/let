import SwiftUI

/// Saved conversations: tap to open one, swipe to delete, or start a new one.
struct HistoryView: View {
    let store: ChatStore
    @Environment(\.dismiss) private var dismiss
    @State private var chats: [ChatSummary]?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if chats?.isEmpty == true {
                    Text("No conversations yet.").foregroundStyle(.secondary)
                }
                ForEach(chats ?? []) { chat in
                    Button {
                        Task {
                            if await run({ try await store.openChat(chat.id) }) {
                                dismiss()
                            }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chat.title).lineLimit(1)
                            Text(chat.updatedAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                    .listRowBackground(chat.active ? Color(.secondarySystemBackground) : nil)
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            Task { _ = await run { try await store.deleteChat(chat.id) } }
                        }
                    }
                }
            }
            .overlay {
                if chats == nil, error == nil {
                    ProgressView()
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("New chat", systemImage: "square.and.pencil") {
                        Task {
                            if await run({ try await store.newChat() }) {
                                dismiss()
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .task { _ = await run { try await store.chats() } }
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
