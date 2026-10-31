import UIKit

/// The server's `reminder` and `email` events (ServerEvent in @cot/shared),
/// shown as the in-app banner.
extension ChatStore {
    func handleNotice(_ frame: JSONValue) {
        switch frame["type"]?.string {
        case "reminder":
            if let text = frame["description"]?.string {
                present(Notice(icon: "⏰", title: "Reminder", text: text))
            }
        case "email":
            // Spam the assistant sorted out stays in the inbox without a banner.
            let category = frame["category"]?.string
            if let subject = frame["subject"]?.string, category != "ignore" {
                let from = frame["from"]?.string ?? "Someone"
                let sender = frame["trusted"]?.bool == false ? "\(from) (unknown sender)" : from
                let detail = frame["summary"]?.string ?? subject
                let action = category == "action"
                present(Notice(
                    icon: action ? "⚠️" : "📧",
                    title: action ? "Email needs action" : "New email",
                    text: "\(sender): \(detail)"
                ))
            }
        default:
            break
        }
    }

    private func present(_ notice: Notice) {
        self.notice = notice
        // In the foreground the banner in the app is enough; in the
        // background the server's push already shows it, if it sends one.
        if UIApplication.shared.applicationState != .active, !Push.serverSends {
            Reminders.notify(title: notice.title, body: notice.text)
        }
    }
}
