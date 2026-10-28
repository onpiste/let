import AuthenticationServices
import CryptoKit
import Observation
import UIKit

/// Signed-in state. Google blocks sign-in in embedded WebViews, so the flow is
/// the system web sheet → `cot://auth/callback?code=…` → POST /auth/token,
/// which trades the code plus the PKCE verifier for a bearer token (see
/// NATIVE_AUTH_PARAMS in @cot/shared). The token is then sent as
/// `Authorization: Bearer` on HTTP and on the WebSocket upgrade.
@MainActor
@Observable
final class AuthModel {
    enum State: Equatable {
        case loading
        case signedOut(message: String?)
        case signedIn(User)
    }

    private(set) var state: State = .loading
    private(set) var token: String?

    private let tokenItem = KeychainItem(account: "session-token")
    private let expiryItem = KeychainItem(account: "session-expiry")
    private var webSession: ASWebAuthenticationSession?
    private let presenter = SheetPresenter()

    /// Loads the stored token and checks it is still accepted.
    func restore() async {
        guard let stored = tokenItem.read(),
              let expiry = expiryItem.read().flatMap(Double.init),
              expiry > Date().timeIntervalSince1970
        else {
            clear()
            return
        }
        token = stored
        await validate()
    }

    /// Re-checks the session, e.g. after the socket closed. Only a 401 signs
    /// the user out; a network error keeps them in.
    func validate() async {
        guard let token else { return }
        var request = URLRequest(url: Config.url("auth/me"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 {
                clear(message: "Your session expired. Sign in again.")
            } else if status == 200, let user = try? JSONDecoder().decode(User.self, from: data) {
                state = .signedIn(user)
            } else if case .loading = state {
                state = .signedOut(message: "Couldn't reach the server (\(status)).")
            }
        } catch {
            if case .loading = state {
                state =
                    .signedOut(message: "Couldn't reach the server. \(error.localizedDescription)")
            }
        }
    }

    func signIn() async {
        do {
            let verifier = Self.base64URL(Data((0 ..< 32).map { _ in UInt8.random(in: 0 ... 255) }))
            let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))

            var login = URLComponents(
                url: Config.url("auth/login"),
                resolvingAgainstBaseURL: false
            )!
            login.queryItems = [
                URLQueryItem(name: "redirect_uri", value: Config.redirectURI),
                URLQueryItem(name: "code_challenge", value: challenge)
            ]
            let callback = try await authenticate(login.url!)
            guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value
            else { throw AuthError.message("Sign-in did not return a code.") }

            var request = URLRequest(url: Config.url("auth/token"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                NativeTokenRequest(code: code, codeVerifier: verifier)
            )
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else {
                throw AuthError
                    .message(status == 403 ? "This account isn't allowed." :
                        "Sign-in failed (\(status)).")
            }
            let result = try JSONDecoder().decode(NativeTokenResponse.self, from: data)
            tokenItem.write(result.token)
            expiryItem.write(String(result.expiresAt))
            token = result.token
            state = .signedIn(result.user)
        } catch AuthError.cancelled {
            state = .signedOut(message: nil)
        } catch {
            state = .signedOut(message: Self.describe(error))
        }
    }

    func signOut() async {
        if let token {
            var request = URLRequest(url: Config.url("auth/logout"))
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        clear()
    }

    private func clear(message: String? = nil) {
        tokenItem.delete()
        expiryItem.delete()
        token = nil
        state = .signedOut(message: message)
    }

    private enum AuthError: Error {
        case cancelled
        case message(String)
    }

    private static func describe(_ error: Error) -> String {
        if case let AuthError.message(text) = error {
            return text
        }
        return error.localizedDescription
    }

    private func authenticate(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url, callbackURLScheme: Config.callbackScheme
            ) { [weak self] callbackURL, error in
                Task { @MainActor in self?.webSession = nil }
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin
                {
                    continuation.resume(throwing: AuthError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? AuthError.message("Sign-in failed."))
                }
            }
            session.presentationContextProvider = presenter
            webSession = session
            if !session.start() {
                webSession = nil
                continuation.resume(throwing: AuthError.message("Could not start sign-in."))
            }
        }
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Anchors the sign-in sheet to the app's key window.
private final class SheetPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
