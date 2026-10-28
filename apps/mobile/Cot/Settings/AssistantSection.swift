import SwiftUI

/// Name, language, instructions, model provider and API keys.
struct AssistantSection: View {
    let model: SettingsModel
    let settings: PublicSettings

    @State private var name = ""
    @State private var language = ""
    @State private var instructions = ""
    @State private var provider = "workers-ai"
    @State private var modelName = ""
    @State private var keys: [String: String] = [:]
    @State private var loaded = false

    var body: some View {
        Section("Assistant") {
            TextField("Name", text: $name)
            TextField("Language (auto mirrors yours)", text: $language)
                .textInputAutocapitalization(.never)
            VStack(alignment: .leading) {
                Text("Instructions").font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $instructions).frame(minHeight: 90)
            }
        }
        Section("Model") {
            Picker("Provider", selection: $provider) {
                ForEach(Providers.all) { Text($0.label).tag($0.id) }
            }
            .onChange(of: provider) {
                if modelName.isEmpty || !Providers.info(provider).suggestions.contains(modelName) {
                    modelName = Providers.info(provider).defaultModel
                }
            }
            TextField("Model", text: $modelName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            ForEach(Providers.all.filter(\.needsKey)) { info in
                HStack {
                    Text("\(info.label) key")
                    SecureField(
                        settings.apiKeys[info.id].map { "••••\($0.last4)" } ?? "Not set",
                        text: binding(for: info.id)
                    )
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }
            }
            Button("Save") { Task { await save() } }
                .disabled(model.busy)
        }
        .onAppear(perform: load)
    }

    private func binding(for provider: String) -> Binding<String> {
        Binding(get: { keys[provider] ?? "" }, set: { keys[provider] = $0 })
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        name = settings.assistantName
        language = settings.language
        instructions = settings.instructions
        provider = settings.provider
        modelName = settings.model
    }

    /// Only changed fields are sent; a typed key replaces the stored one.
    private func save() async {
        var patch: [String: JSONValue] = [
            "assistantName": .string(name),
            "instructions": .string(instructions),
            "language": .string(language),
            "provider": .string(provider),
            "model": .string(modelName),
        ]
        let typed = keys.filter { !$0.value.isEmpty }
        if !typed.isEmpty {
            patch["apiKeys"] = .object(typed.mapValues(JSONValue.string))
        }
        if await model.save(.object(patch)) { keys = [:] }
    }
}
