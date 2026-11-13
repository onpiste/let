import SwiftUI

/// The assistant's mailbox: Inbox / Archived, newest first; tap one to read
/// it. Opened from the toolbar, a new-mail banner or a push alert (then
/// straight to `openID`). Reloads when the unread count changes, i.e. on new
/// mail or a change on another device. Mirrors inbox-page.tsx.
struct InboxView: View {
    let store: ChatStore
    /// An email to open at once, from a banner or push alert.
    let openID: Int?
    /// Called after "Ask Cot" started a chat, to show it.
    let onAsked: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var archived = false
    @State private var emails: [InboxEmail]?
    @State private var more = false
    @State private var path: [Int] = []
    @State private var error: String?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                HStack {
                    Picker("Mailbox", selection: $archived) {
                        Text("Inbox").tag(false)
                        Text("Archived").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                    Spacer()
                    if !archived, store.unreadEmails > 0 {
                        // The `inbox` event that follows reloads the list.
                        Button("Mark all read") { Task { await markAllRead() } }
                            .buttonStyle(.borderless)
                            .font(.subheadline)
                    }
                }
                .listRowSeparator(.hidden)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if emails?.isEmpty == true {
                    Text(archived ? "Nothing archived." :
                        "No mail yet. Your address is in Settings.")
                        .foregroundStyle(.secondary)
                }
                ForEach(emails ?? []) { email in
                    NavigationLink(value: email.id) { EmailRow(email: email) }
                }
                if more {
                    Button("Older mail") { Task { await loadMore() } }
                }
            }
            .listStyle(.plain)
            .overlay {
                if emails == nil, error == nil {
                    ProgressView()
                }
            }
            .navigationTitle("Inbox")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .navigationDestination(for: Int.self) { id in
                EmailView(store: store, id: id) {
                    dismiss()
                    onAsked()
                }
            }
            .task(id: archived) { await load() }
            .onChange(of: store.unreadEmails) { Task { await load() } }
            .onAppear {
                if let openID, path.isEmpty {
                    path = [openID]
                }
            }
        }
    }

    private func load() async {
        do {
            let page = try await store.inbox(archived: archived)
            emails = page.emails
            more = page.more
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func markAllRead() async {
        do {
            try await store.markAllEmailsRead()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadMore() async {
        do {
            let page = try await store.inbox(archived: archived, offset: emails?.count ?? 0)
            emails = (emails ?? []) + page.emails
            more = page.more
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One email in the list: sender, subject and the assistant's summary.
/// Mirrors email-row.tsx.
private struct EmailRow: View {
    let email: InboxEmail

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(email.senderText)
                    .font(.footnote)
                    .foregroundStyle(email.read ? .secondary : .primary)
                    .lineLimit(1)
                Spacer()
                Text(email.receivedText).font(.caption).foregroundStyle(.secondary)
            }
            Text(email.subject.isEmpty ? "(no subject)" : email.subject)
                .fontWeight(email.read ? .regular : .semibold)
            if let summary = email.summary {
                Text(summary).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
            if let label = email.categoryLabel {
                CategoryPill(label: label, action: email.category == "action")
            }
        }
        .padding(.vertical, 2)
    }
}

/// The assistant's sorting, as a small pill (`.pill` in inbox.css).
struct CategoryPill: View {
    let label: String
    let action: Bool

    var body: some View {
        Text(label)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 1)
            .foregroundStyle(action ? Color.orange : Color.secondary)
            .background(
                action ? Color.orange.opacity(0.15) : Color(.systemGray5),
                in: Capsule()
            )
    }
}
