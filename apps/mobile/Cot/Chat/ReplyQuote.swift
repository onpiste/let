import SwiftUI

/// The message a reply answers, carried in the new user message's
/// `metadata.replyTo` so every client shows it above the bubble and the
/// server hands it to the model as context. Mirrors `ReplyQuote` in
/// `@cot/shared` (reply.ts); the web views are in `reply-quote.tsx`.
struct ReplyQuote: Equatable {
    /// `REPLY_QUOTE_MAX_CHARS`: a long answer is cut, not refused.
    static let maxCharacters = 4000

    let id: String
    /// "user" or "assistant".
    let role: String
    let text: String

    init?(id: String, role: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !trimmed.isEmpty, role == "user" || role == "assistant" else {
            return nil
        }
        self.id = id
        self.role = role
        self.text = trimmed.count > Self.maxCharacters
            ? String(trimmed.prefix(Self.maxCharacters - 1)) + "…"
            : trimmed
    }

    /// The quote a reply to this message carries (`replyQuoteFor` on the web).
    init?(message: ChatMessage) {
        let typed = message.plainText.isEmpty
            ? message.attachmentNames.joined(separator: ", ")
            : message.plainText
        self.init(id: message.id, role: message.role, text: message.isUser ? typed : message.shareText)
    }

    init?(json: JSONValue?) {
        guard let id = json?["id"]?.string, let role = json?["role"]?.string,
              let text = json?["text"]?.string
        else { return nil }
        self.init(id: id, role: role, text: text)
    }

    var json: JSONValue {
        .object(["id": .string(id), "role": .string(role), "text": .string(text)])
    }

    var isAssistant: Bool {
        role == "assistant"
    }
}

extension ChatMessage {
    /// The message this one replies to, if any.
    var replyTo: ReplyQuote? {
        ReplyQuote(json: extra["metadata"]?["replyTo"])
    }
}

/// The replied-to message, small and dim above the user's bubble, joined to
/// it by a curved line. A tap scrolls to the original. Mirrors
/// `QuotedMessage` in reply-quote.tsx.
struct QuotedMessageView: View {
    let quote: ReplyQuote
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(quote.text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    Color(.secondarySystemBackground).opacity(0.6),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Color(.systemGray4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottomTrailing) {
            ReplyConnector()
                .stroke(Color(.systemGray4), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .frame(width: 12, height: 14)
                .offset(x: 13, y: 9)
                .accessibilityHidden(true)
        }
        .padding(.trailing, 16)
        .accessibilityLabel("Replying to: \(quote.text)")
    }
}

/// The ╮ that leads from a quote down to the reply under it.
private struct ReplyConnector: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - 9, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + 9),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        return path
    }
}

/// Above the composer while replying: what is being answered, and a button
/// to stop replying. Mirrors `ReplyPreview` in reply-quote.tsx.
struct ReplyPreview: View {
    let quote: ReplyQuote
    let onCancel: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.accentColor)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(quote.isAssistant ? "Replying to Cot" : "Replying to you")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Text(quote.text)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 26, height: 26)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancel reply")
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(8)
        .background(
            Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }
}
