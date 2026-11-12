import Foundation

/// The values ChatStore shows: the turn's status, the in-app banner and the
/// messages waiting for the turn to end.
extension ChatStore {
    enum Status { case ready, submitted, streaming }

    struct Notice: Identifiable, Equatable {
        let id = UUID()
        let icon: String
        let title: String
        let text: String
        /// A new email's id: tapping the banner opens it in the inbox.
        var emailID: Int?
    }

    /// A message written while the assistant was still answering; sent when
    /// the turn ends.
    struct Queued: Identifiable, Equatable {
        let id = UUID()
        let text: String
        let attachments: [Attachment]
    }
}
