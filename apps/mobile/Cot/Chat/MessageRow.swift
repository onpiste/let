import SwiftUI
import UIKit

/// One turn: a user bubble, or the assistant's text, reasoning and tools.
struct MessageRow: View {
    let message: ChatMessage
    let toolLabels: [String: String]
    /// The reply is still arriving; hide its actions until it settles.
    var streaming = false
    let onApproval: (String, Bool) -> Void
    /// Quote this message in the composer for a follow-up.
    let onReply: (ReplyQuote) -> Void
    /// Scroll to the message with this id (a tapped quote's original).
    let onShowMessage: (String) -> Void
    /// Replaces this user message with the edited text; nil while busy.
    var onEdit: ((String) -> Void)?
    /// Answers the last user message again; set on the last reply only.
    var onRegenerate: (() -> Void)?

    @State private var editing = false

    private var quote: ReplyQuote? {
        ReplyQuote(message: message)
    }

    private func reply() {
        if let quote {
            onReply(quote)
        }
    }

    var body: some View {
        if message.isUser, editing {
            MessageEditView(
                text: message.plainText,
                hasFiles: !message.attachmentNames.isEmpty,
                onSave: { text in
                    editing = false
                    onEdit?(text)
                },
                onCancel: { editing = false }
            )
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
        } else if message.isUser {
            VStack(alignment: .trailing, spacing: 4) {
                if let replyTo = message.replyTo {
                    QuotedMessageView(quote: replyTo) { onShowMessage(replyTo.id) }
                        .padding(.bottom, 4)
                }
                ForEach(Array(message.attachmentNames.enumerated()), id: \.offset) { _, name in
                    Label(name, systemImage: "paperclip")
                        .font(.footnote)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color(.secondarySystemBackground), in: Capsule())
                        // A file-only message can be replied to as well.
                        .contextMenu {
                            MessageMenu(text: name, onReply: reply)
                        }
                }
                if !message.plainText.isEmpty {
                    Text(message.plainText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .foregroundStyle(.white)
                        .background(
                            Color.accentColor,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                        )
                        .textSelection(.enabled)
                        .contextMenu {
                            MessageMenu(
                                text: message.plainText,
                                onReply: reply,
                                onEdit: onEdit == nil ? nil : { editing = true }
                            )
                        }
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(message.items) { item in
                    switch item {
                    case let .text(_, text):
                        MarkdownView(source: text)
                    case let .reasoning(_, text, streaming):
                        ReasoningView(text: text, streaming: streaming)
                    case let .tool(_, call):
                        ToolChipView(call: call, labels: toolLabels, onApproval: onApproval)
                    }
                }
                if !streaming, !message.shareText.isEmpty {
                    MessageActions(
                        text: message.shareText,
                        onReply: reply,
                        onRegenerate: onRegenerate
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Reply, copy and share buttons under an assistant reply, plus regenerate
/// on the last one, in the order of `message-actions.tsx`.
private struct MessageActions: View {
    let text: String
    let onReply: () -> Void
    let onRegenerate: (() -> Void)?
    @State private var copied = false

    var body: some View {
        HStack(spacing: 16) {
            Button(action: onReply) {
                Image(systemName: "arrowshape.turn.up.left")
            }
            .accessibilityLabel("Reply")
            Button {
                UIPasteboard.general.string = text
                copied = true
                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    copied = false
                }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
            }
            .accessibilityLabel(copied ? "Copied" : "Copy")
            .sensoryFeedback(.success, trigger: copied) { _, new in new }
            if let onRegenerate {
                Button(action: onRegenerate) {
                    Image(systemName: "arrow.counterclockwise")
                }
                .accessibilityLabel("Regenerate")
            }
            ShareLink(item: text) {
                Image(systemName: "square.and.arrow.up")
            }
            .accessibilityLabel("Share")
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .buttonStyle(.plain)
    }
}

/// Long-press menu on a user bubble: the web's reply, copy, edit and share
/// buttons under it (message-actions.tsx).
private struct MessageMenu: View {
    let text: String
    let onReply: () -> Void
    var onEdit: (() -> Void)?

    var body: some View {
        Button("Reply", systemImage: "arrowshape.turn.up.left", action: onReply)
        Button("Copy", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = text
        }
        if let onEdit {
            Button("Edit", systemImage: "pencil", action: onEdit)
        }
        ShareLink(item: text) {
            Label("Share", systemImage: "square.and.arrow.up")
        }
    }
}

/// The model's reasoning, collapsed behind a "Thinking" disclosure.
private struct ReasoningView: View {
    let text: String
    let streaming: Bool

    var body: some View {
        DisclosureGroup {
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        } label: {
            // Text only, matching the web `thinking.tsx` summary.
            Text(streaming ? "Thinking…" : "Thought")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

/// A user message being edited in place of its bubble. Sending replaces the
/// message and everything after it with a new answer (web: message-edit.tsx).
private struct MessageEditView: View {
    let hasFiles: Bool
    let onSave: (String) -> Void
    let onCancel: () -> Void
    @State private var value: String
    @FocusState private var focused: Bool

    init(text: String, hasFiles: Bool, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.hasFiles = hasFiles
        self.onSave = onSave
        self.onCancel = onCancel
        _value = State(initialValue: text)
    }

    private var canSave: Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || hasFiles
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            TextField("Edit message", text: $value, axis: .vertical)
                .lineLimit(2 ... 8)
                .focused($focused)
            HStack(spacing: 12) {
                Button("Cancel", action: onCancel)
                Button("Send") { onSave(value) }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSave)
            }
            .font(.subheadline)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .onAppear { focused = true }
    }
}
