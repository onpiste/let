import SwiftUI
import UIKit

/// One turn: a user bubble, or the assistant's text, reasoning and tools.
struct MessageRow: View {
    let message: ChatMessage
    let toolLabels: [String: String]
    /// The reply is still arriving; hide its actions until it settles.
    var streaming = false
    let onApproval: (String, Bool) -> Void

    var body: some View {
        if message.isUser {
            VStack(alignment: .trailing, spacing: 4) {
                ForEach(Array(message.attachmentNames.enumerated()), id: \.offset) { _, name in
                    Label(name, systemImage: "paperclip")
                        .font(.footnote)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color(.secondarySystemBackground), in: Capsule())
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
                        .contextMenu { MessageMenu(text: message.plainText) }
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
                    MessageActions(text: message.shareText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Copy and share buttons under an assistant reply.
private struct MessageActions: View {
    let text: String
    @State private var copied = false

    var body: some View {
        HStack(spacing: 16) {
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

/// Long-press menu on a user bubble.
private struct MessageMenu: View {
    let text: String

    var body: some View {
        Button("Copy", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = text
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
            Label(streaming ? "Thinking…" : "Thought", systemImage: "brain")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}
