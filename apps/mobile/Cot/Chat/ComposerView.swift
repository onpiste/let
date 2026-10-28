import SwiftUI

/// The message box. Return adds a line; the button sends, or stops the turn
/// while the assistant is replying.
struct ComposerView: View {
    @Binding var text: String
    let busy: Bool
    let onSend: () -> Void
    let onStop: () -> Void
    @FocusState private var focused: Bool

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message Cot…", text: $text, axis: .vertical)
                .lineLimit(1...6)
                .focused($focused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))

            Button {
                if busy { onStop() } else if canSend { onSend() }
            } label: {
                Image(systemName: busy ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(.system(size: 34))
                    .symbolRenderingMode(.hierarchical)
            }
            .disabled(!busy && !canSend)
            .accessibilityLabel(busy ? "Stop" : "Send")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }
}
