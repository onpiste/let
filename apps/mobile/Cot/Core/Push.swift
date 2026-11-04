import UIKit
import UserNotifications

/// APNs. iOS issues a device token, which `ChatStore` registers with the
/// assistant (`registerPushDevice` in @cot/shared) whenever its socket opens,
/// so the server can reach the phone while the app is closed.
@MainActor
enum Push {
    private(set) static var deviceToken: String?
    /// Whether the server pushes notices. Until it says so (or when the
    /// deployment has no APNs key) they come as local notifications instead.
    static var serverSends = false
    static var onToken: ((String) -> Void)?
    /// An email a tapped alert asked to open, kept until `ChatView` takes it
    /// (the tap can come before the chat screen exists, on a cold launch).
    static var pendingEmail: Int?
    /// Posted when `pendingEmail` is set while the app is running.
    static let openEmail = Notification.Name("CotOpenEmail")

    // Which APNs gateway the token belongs to: builds run from Xcode get
    // sandbox tokens; TestFlight and App Store builds production ones.
    #if DEBUG
        static let environment = "sandbox"
    #else
        static let environment = "production"
    #endif

    /// Asks iOS for a token once per launch; the answer arrives in `AppDelegate`.
    static func register() {
        guard deviceToken == nil else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// A tapped alert's `path` (PushAlert in integrations/push.ts): the web
    /// path of what it is about, e.g. `/inbox/12` for a new email.
    static func open(path: String) {
        let prefix = "/inbox/"
        guard path.hasPrefix(prefix), let id = Int(path.dropFirst(prefix.count)) else { return }
        pendingEmail = id
        NotificationCenter.default.post(name: openEmail, object: nil)
    }

    static func received(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        onToken?(hex)
    }

    /// On sign-out. APNs then reports the old token as gone, and the server
    /// forgets it.
    static func stop() {
        deviceToken = nil
        serverSends = false
        UIApplication.shared.unregisterForRemoteNotifications()
    }
}

/// Receives the APNs token, which iOS only hands to an app delegate, and
/// taps on notifications, which open what they are about.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _: UIApplication,
        didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let path = response.notification.request.content.userInfo["path"] as? String
        Task { @MainActor in
            if let path {
                Push.open(path: path)
            }
            completionHandler()
        }
    }

    /// In the foreground the app's own banner shows it, as before a delegate
    /// was set.
    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([])
    }

    func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Push.received(deviceToken)
    }

    func application(
        _: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Usually a simulator or a build without the push entitlement; local
        // notifications still work.
        DevLog.warn("apns", "Registration failed", ["error": error.localizedDescription])
    }
}
