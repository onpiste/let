import SwiftUI

/// Messages waiting for the current answer to finish; tap one to remove it.
struct QueuedView: View {
    let queue: [ChatStore.Queued]
    let onRemove: (ChatStore.Queued.ID) -> Void

    var body: some View {
        if !queue.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(queue) { message in
                        Button { onRemove(message.id) } label: {
                            Label(summary(message), systemImage: "xmark.circle.fill")
                                .font(.footnote)
                                .lineLimit(1)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color(.secondarySystemBackground), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove queued message")
                    }
                }
                .padding(.horizontal, 12)
            }
            .padding(.top, 6)
            .background(.bar)
            .opacity(0.8)
        }
    }

    private func summary(_ message: ChatStore.Queued) -> String {
        let files = message.attachments.count
        return files > 0 ? "\(message.text) (+\(files) file\(files > 1 ? "s" : ""))" : message.text
    }
}
