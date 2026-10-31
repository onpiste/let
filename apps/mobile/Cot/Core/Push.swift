import UIKit

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

/// Receives the APNs token, which iOS only hands to an app delegate.
final class AppDelegate: NSObject, UIApplicationDelegate {
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
        print("APNs registration failed: \(error.localizedDescription)")
    }
}
