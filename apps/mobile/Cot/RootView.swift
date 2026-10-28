import SwiftUI

struct RootView: View {
    @State private var auth = AuthModel()

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ProgressView()
            case let .signedOut(message):
                SignInView(message: message) { await auth.signIn() }
            case let .signedIn(user):
                ChatView(user: user, auth: auth)
            }
        }
        .animation(.default, value: auth.state)
        .task { await auth.restore() }
    }
}
