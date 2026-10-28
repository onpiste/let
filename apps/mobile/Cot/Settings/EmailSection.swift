import SwiftUI

/// The assistant's own address and who may email it.
struct EmailSection: View {
    let model: SettingsModel
    @State private var alias = ""
    @State private var acceptFromAnyone = false
    @State private var senders = ""
    @State private var loaded = false

    var body: some View {
        if let status = model.email, status.enabled {
            Section {
                if let address = status.address {
                    LabeledContent("Address", value: address)
                }
                HStack {
                    TextField("Address name", text: $alias)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("@\(status.domain ?? "")").foregroundStyle(.secondary)
                    Button("Save") { Task { await model.setEmailAlias(alias) } }
                        .disabled(alias.isEmpty || alias == status.alias || model.busy)
                }
                Toggle("Accept mail from anyone", isOn: $acceptFromAnyone)
                VStack(alignment: .leading) {
                    Text("Trusted senders").font(.footnote).foregroundStyle(.secondary)
                    TextEditor(text: $senders)
                        .frame(minHeight: 70)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Button("Save policy") {
                    let list = senders.split(whereSeparator: \.isNewline)
                        .map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                    Task { await model.updateEmailPolicy(acceptFromAnyone: acceptFromAnyone, trustedSenders: list) }
                }
                .disabled(model.busy)
            } header: {
                Text("Email")
            } footer: {
                Text(acceptFromAnyone ? "Strangers' mail is kept but marked as from an unknown sender." : "Only you and your trusted senders can reach it; other mail bounces. One trusted address per line.")
            }
            .onAppear { load(status) }
        }
    }

    private func load(_ status: EmailStatus) {
        guard !loaded else { return }
        loaded = true
        alias = status.alias ?? ""
        acceptFromAnyone = status.acceptFromAnyone ?? false
        senders = (status.trustedSenders ?? []).joined(separator: "\n")
    }
}
