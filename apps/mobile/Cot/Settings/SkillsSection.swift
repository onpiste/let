import SwiftUI

/// The user's skills: instructions the assistant loads when a task fits.
struct SkillsSection: View {
    let model: SettingsModel
    @State private var name = ""
    @State private var description = ""
    @State private var instructions = ""

    var body: some View {
        Section {
            if model.skills.isEmpty {
                Text("No skills yet.").foregroundStyle(.secondary)
            }
            ForEach(model.skills) { skill in
                VStack(alignment: .leading, spacing: 2) {
                    Text(skill.name).font(.body.weight(.medium))
                    Text(skill.description).font(.footnote).foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    name = skill.name
                    description = skill.description
                    instructions = skill.instructions
                }
                .swipeActions {
                    Button("Delete", role: .destructive) {
                        Task { await model.deleteSkill(skill.name) }
                    }
                }
            }
            TextField("weekly-report", text: $name)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("When to use it", text: $description)
            TextField("Instructions (Markdown)", text: $instructions, axis: .vertical)
                .lineLimit(4...12)
            Button("Save skill") {
                Task {
                    if await model.saveSkill(name: name, description: description, instructions: instructions) {
                        name = ""
                        description = ""
                        instructions = ""
                    }
                }
            }
            .disabled(name.isEmpty || description.isEmpty || instructions.isEmpty || model.busy)
        } header: {
            Text("Skills")
        } footer: {
            Text("Reusable instructions. The assistant sees each name and description, and loads the full text only when a request fits. Tap a skill to edit it.")
        }
    }
}
