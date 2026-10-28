import SwiftUI

/// Every scheduled task. Swipe to pause, resume or delete; tap one to change
/// it in words (the chat opens with a draft).
struct TasksView: View {
    let store: ChatStore
    let onEdit: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var tasks: [ScheduledTask]?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if tasks?.isEmpty == true {
                    Text("No tasks yet.").foregroundStyle(.secondary)
                }
                ForEach(tasks ?? []) { task in
                    Button {
                        onEdit("Change the task \"\(task.description)\" (id \(task.id)): ")
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.description)
                            Text(task.statusText).font(.caption).foregroundStyle(.secondary)
                        }
                        .opacity(task.paused ? 0.6 : 1)
                    }
                    .foregroundStyle(.primary)
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            Task { await run { try await store.deleteTask(task.id) } }
                        }
                        Button(task.paused ? "Resume" : "Pause") {
                            Task {
                                await run {
                                    task.paused
                                        ? try await store.resumeTask(task.id)
                                        : try await store.pauseTask(task.id)
                                }
                            }
                        }
                        .tint(.orange)
                    }
                }
            }
            .overlay { if tasks == nil && error == nil { ProgressView() } }
            .navigationTitle("Tasks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { await run { try await store.tasks() } }
        }
    }

    private func run(_ action: () async throws -> [ScheduledTask]) async {
        do {
            tasks = try await action()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
