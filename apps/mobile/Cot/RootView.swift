import SwiftUI

struct RootView: View {
    @State private var auth = AuthModel()

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ProgressView()
            case .signedOut(let message):
                SignInView(message: message) { await auth.signIn() }
            case .signedIn(let user):
                ChatView(user: user, auth: auth)
            }
        }
        .animation(.default, value: auth.state)
        .task { await auth.restore() }
    }
}
