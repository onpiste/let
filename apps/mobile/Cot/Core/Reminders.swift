import UIKit
import UserNotifications

/// System notifications for reminders and new mail. When the server has an
/// APNs key it pushes them (see `Push`); otherwise they come over the socket
/// and show here, which only works while the app is still connected. The
/// permission is asked on the first message the user sends.
enum Reminders {
    static func requestPermission() {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound]) { granted, _ in
                if granted {
                    Task { @MainActor in Push.register() }
                }
            }
    }

    /// At sign-in, without asking: gets the APNs token if notifications are
    /// already allowed.
    static func registerIfAllowed() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            if settings.authorizationStatus == .authorized {
                Task { @MainActor in Push.register() }
            }
        }
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
