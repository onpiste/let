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
                SignedInView(user: user, auth: auth)
            }
        }
        .animation(.default, value: auth.state)
        .task { await auth.restore() }
    }
}

/// Holds the harness choice; the chat is rebuilt (new socket, own history)
/// whenever it changes.
private struct SignedInView: View {
    let user: User
    let auth: AuthModel
    @State private var harness = Harness.saved

    var body: some View {
        ChatView(user: user, auth: auth, harness: $harness)
            .id(harness)
            .onChange(of: harness) { harness.save() }
    }
}
