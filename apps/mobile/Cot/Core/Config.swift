import Foundation

/// Deployment values. They live in project.yml (Info.plist), not in code, so
/// a fork changes them in one place.
enum Config {
    /// The Worker's origin, e.g. https://runlet.us. Debug builds use a local
    /// `bun run dev` server instead when Local.xcconfig names one.
    static let serverURL: URL = {
        #if DEBUG
            if let dev = devServerURL {
                return dev
            }
        #endif
        let raw = Bundle.main.object(forInfoDictionaryKey: "CotServerURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://runlet.us")!
    }()

    #if DEBUG
        /// `COT_DEV_SERVER` from Local.xcconfig, e.g. `localhost:5173`. It is
        /// host and port only, because `//` starts a comment in an xcconfig.
        private static var devServerURL: URL? {
            let raw = Bundle.main.object(forInfoDictionaryKey: "CotDevServer") as? String
            guard let host = raw?.trimmingCharacters(in: .whitespaces), !host.isEmpty
            else { return nil }
            return URL(string: "http://\(host)")
        }
    #endif

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

    /// `wss://host/<basePath>` for an agent.
    static func socketURL(basePath: String) -> URL {
        let http = url(basePath)
        var components = URLComponents(url: http, resolvingAgainstBaseURL: false)
        let scheme = http.scheme == "http" ? "ws" : "wss"
        components?.scheme = scheme
        // Unreachable for a valid serverURL; the plain URL fails at connect time.
        return components?.url ?? http
    }
}
