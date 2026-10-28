import UIKit
import UserNotifications

/// System notifications for reminders and new mail while the app is in the
/// background but still connected. The server pushes them over the socket (there
/// is no APNs); the permission is asked on the first message the user sends.
enum Reminders {
    static func requestPermission() {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
