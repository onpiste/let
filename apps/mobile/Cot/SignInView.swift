import SwiftUI

struct SignInView: View {
    let message: String?
    let onSignIn: () async -> Void
    @State private var working = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            Text(greeting()).font(.largeTitle.bold())
            Text("I'm Cot, your personal assistant. Sign in to continue.")
                .foregroundStyle(.secondary)
            if let message {
                Text(message).font(.footnote).foregroundStyle(.red)
            }
            Button {
                working = true
                Task {
                    await onSignIn()
                    working = false
                }
            } label: {
                HStack {
                    if working { ProgressView().tint(.white) }
                    Text("Sign in with Google")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(working)
            .padding(.top, 12)
            Spacer()
        }
        .padding(24)
    }
}
