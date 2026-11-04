import SwiftUI

/// One email: the assistant's summary, what to do with it, and the
/// plain-text body. Opening it marks it read. Mirrors email-view.tsx.
struct EmailView: View {
    let store: ChatStore
    let id: Int
    /// Called once "Ask Cot" has started a chat about it.
    let onAsked: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var email: InboxEmail?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if let email {
                    content(email)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay {
            if email == nil, error == nil {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func content(_ email: InboxEmail) -> some View {
        Text(email.subject.isEmpty ? "(no subject)" : email.subject)
            .font(.title3.weight(.semibold))
        Text("\(email.senderText) · \(email.receivedText)")
            .font(.footnote).foregroundStyle(.secondary)
        if !email.trusted {
            Text("Not from you or a trusted sender. Be careful with links and requests in it.")
                .font(.footnote).foregroundStyle(.red)
        }
        if let summary = email.summary {
            VStack(alignment: .leading, spacing: 6) {
                if let label = email.categoryLabel {
                    CategoryPill(label: label, action: email.category == "action")
                }
                Text(summary).font(.subheadline)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        }
        HStack(spacing: 16) {
            Button(email.archived ? "Move to inbox" : "Archive") {
                Task { await archive(email) }
            }
            .foregroundStyle(.secondary)
            Button("Ask Cot") { Task { await ask(email) } }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
        .disabled(busy)
        if let attachments = email.attachments, !attachments.isEmpty {
            Text("Attachments (not kept): \(attachments.joined(separator: ", "))")
                .font(.caption).foregroundStyle(.secondary)
        }
        // Plain text from the server; Text never renders HTML or links in it.
        Text(verbatim: email.body ?? "")
            .font(.subheadline)
            .textSelection(.enabled)
    }

    private func load() async {
        do {
            email = try await store.openEmail(id)
            if email == nil {
                error = "That email is no longer in the inbox."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func archive(_ email: InboxEmail) async {
        busy = true
        defer { busy = false }
        do {
            try await store.archiveEmail(email.id, archived: !email.archived)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func ask(_ email: InboxEmail) async {
        busy = true
        defer { busy = false }
        do {
            try await store.askAboutEmail(email.id)
            onAsked()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
