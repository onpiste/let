import Foundation

/// Deployment values. They live in project.yml (Info.plist), not in code, so
/// a fork changes them in one place.
enum Config {
    /// The Worker's origin, e.g. https://runlet.us.
    static let serverURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CotServerURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://runlet.us")!
    }()

    /// Where native sign-in returns; matches NATIVE_REDIRECT_URI on the server.
    static let redirectURI: String =
        Bundle.main.object(forInfoDictionaryKey: "CotRedirectURI") as? String
        ?? "cot://auth/callback"

    static var callbackScheme: String {
        URL(string: redirectURI)?.scheme ?? "cot"
    }

    static func url(_ path: String) -> URL {
        serverURL.appendingPathComponent(path)
    }

    /// `wss://host/<basePath>` for an agent harness.
    static func socketURL(basePath: String) -> URL {
        var components = URLComponents(
            url: url(basePath), resolvingAgainstBaseURL: false)!
        components.scheme = components.scheme == "http" ? "ws" : "wss"
        return components.url!
    }
}
