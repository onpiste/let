import Capacitor

/// The app's root view controller. Registers plugins that live in this app
/// target rather than in an npm package.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The page scrolls inside its own container; the WebView's native
        // indicator would only show a stray bar at the screen edge.
        webView?.scrollView.showsVerticalScrollIndicator = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
    }
}
