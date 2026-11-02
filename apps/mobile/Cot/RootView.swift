import SwiftUI

struct RootView: View {
    @State private var auth = AuthModel()
    @Environment(\.scenePhase) private var scenePhase

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
        .task {
            DevLog.shared.token = { [auth] in auth.token }
            await DevLog.shared.start()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                Task { await DevLog.shared.flush() }
            }
        }
    }
}
