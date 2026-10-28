import SwiftUI

/// The user's own Telegram bot: paste the BotFather token, then claim it.
struct TelegramSection: View {
    let model: SettingsModel
    @State private var token = ""
    @Environment(\.openURL) private var openURL

    var body: some View {
        Section {
            if let status = model.telegram, status.configured {
                LabeledContent("Bot", value: "@\(status.botUsername ?? "")")
                if status.linked == true {
                    Text("Linked").foregroundStyle(.green)
                } else if let claim = status.claimUrl.flatMap(URL.init(string:)) {
                    Button("Open @\(status.botUsername ?? "") and press Start") { openURL(claim) }
                    Button("New link") { Task { await model.newTelegramClaimLink() } }
                }
                if status.webhookSet == false {
                    Text("No webhook yet: connect the bot from the deployed Worker.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Button("Disconnect", role: .destructive) {
                    Task { await model.disconnectTelegram() }
                }
            } else {
                SecureField("Bot token from @BotFather", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Connect") {
                    Task {
                        await model.connectTelegram(token: token)
                        token = ""
                    }
                }
                .disabled(token.isEmpty || model.busy)
            }
        } header: {
            Text("Telegram")
        } footer: {
            Text(
                "Talk to your assistant from Telegram with your own bot. The Telegram account that presses Start becomes its owner."
            )
        }
    }
}
