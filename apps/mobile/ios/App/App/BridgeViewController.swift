import Capacitor

/// The app's root view controller. Registers plugins that live in this app
/// target rather than in an npm package.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
    }
}
