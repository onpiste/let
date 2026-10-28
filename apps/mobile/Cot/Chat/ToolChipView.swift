import SwiftUI

private let toolTitles: [String: String] = [
    "remember": "Saved to memory",
    "forget": "Removed from memory",
    "scheduleTask": "Reminder set",
    "getScheduledTasks": "Checked reminders",
    "cancelScheduledTask": "Reminder cancelled",
    "runCommand": "Ran command",
    "writeSandboxFile": "Wrote file",
    "readSandboxFile": "Read file",
    "browseWeb": "Opened web page",
    "searchKnowledge": "Searched knowledge base",
    "runCode": "Ran code",
    "codeTask": "Coding agent",
    "updateScheduledTask": "Task updated",
    "pauseScheduledTask": "Task paused",
    "resumeScheduledTask": "Task resumed"
]

/// A tool call as a chip, with Approve / Reject when the tool asks first.
struct ToolChipView: View {
    let call: ToolCall
    let labels: [String: String]
    let onApproval: (String, Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(call.isDone ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
                Text(toolTitles[call.name] ?? labels[call.name] ?? call.name)
                    .font(.footnote.weight(.medium))
                if !call.detail.isEmpty {
                    Text("· \(call.detail)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Color(.secondarySystemBackground), in: Capsule())

            if call.awaitsApproval, let id = call.approvalID {
                HStack(spacing: 12) {
                    Button("Approve") { onApproval(id, true) }
                        .buttonStyle(.borderedProminent)
                    Button("Reject", role: .destructive) { onApproval(id, false) }
                        .buttonStyle(.bordered)
                }
                .controlSize(.small)
            }
        }
    }
}
