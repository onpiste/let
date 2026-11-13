import SwiftUI

/// The email a `sendEmail` call would send, shown whole on its chip so the
/// owner reads exactly what goes out before approving. Mirrors
/// email-draft.tsx.
struct EmailDraftView: View {
    let input: JSONValue

    private func text(_ key: String) -> String {
        input[key]?.string ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            (Text("To ").foregroundStyle(.secondary) + Text(verbatim: text("to")))
            (Text("Subject ").foregroundStyle(.secondary) + Text(verbatim: text("subject")))
            // Model output, shown as plain text.
            Text(verbatim: text("body"))
                .padding(.top, 6)
                .textSelection(.enabled)
        }
        .font(.subheadline)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(.systemGray4), lineWidth: 1))
    }
}
