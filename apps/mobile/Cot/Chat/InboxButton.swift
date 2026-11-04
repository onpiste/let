import SwiftUI

/// The toolbar's inbox button, with the unread count as a badge. Mirrors the
/// inbox button in chat-page.tsx.
struct InboxButton: View {
    let unread: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "envelope")
                .overlay(alignment: .topTrailing) {
                    if unread > 0 {
                        Text(unread > 99 ? "99+" : "\(unread)")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color.orange, in: Capsule())
                            .offset(x: 10, y: -8)
                    }
                }
        }
        .accessibilityLabel(unread > 0 ? "Inbox, \(unread) unread" : "Inbox")
    }
}
