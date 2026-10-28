import SwiftUI

/// One turn: a user bubble, or the assistant's text, reasoning and tools.
struct MessageRow: View {
    let message: ChatMessage
    let toolLabels: [String: String]
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
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(message.items) { item in
                    switch item {
                    case .text(_, let text):
                        MarkdownView(source: text)
                    case .reasoning(_, let text, let streaming):
                        ReasoningView(text: text, streaming: streaming)
                    case .tool(_, let call):
                        ToolChipView(call: call, labels: toolLabels, onApproval: onApproval)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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
