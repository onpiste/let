import AuthenticationServices
import Capacitor

/// Opens a sign-in page in ASWebAuthenticationSession and resolves with the
/// URL it redirects to. Google refuses sign-in inside an embedded WebView, so
/// the web app calls this (as `WebAuth.start`) instead of navigating to
/// /auth/login itself; see apps/web/src/lib/native-auth.ts.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    // Held so the session isn't deallocated while it is on screen.
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let url = call.getString("url").flatMap(URL.init(string:)),
              let scheme = call.getString("callbackScheme")
        else {
            call.reject("url and callbackScheme are required")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: scheme
            ) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    call.reject("Sign-in cancelled", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed")
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not start sign-in")
            }
        }
    }
}

extension WebAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(
        for _: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
