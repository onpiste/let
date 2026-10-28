import PhotosUI
import SwiftUI

/// The message box. Return adds a line; the button sends (queues while the
/// assistant is replying), or stops the turn when the box is empty. The paperclip attaches files or
/// photos.
struct ComposerView: View {
    @Binding var text: String
    @Binding var attachments: [Attachment]
    let busy: Bool
    let onError: (String) -> Void
    let onSend: () -> Void
    let onStop: () -> Void
    @FocusState private var focused: Bool
    @State private var pickingFile = false
    @State private var pickingPhoto = false
    @State private var photo: PhotosPickerItem?

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }

    /// While replying, the button stops the turn only when there is nothing
    /// to queue.
    private var stopping: Bool {
        busy && !canSend
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(attachments) { attachment in
                            Button {
                                attachments.removeAll { $0.id == attachment.id }
                            } label: {
                                Label(attachment.name, systemImage: "xmark.circle.fill")
                                    .font(.footnote)
                                    .lineLimit(1)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color(.secondarySystemBackground), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(attachment.name)")
                        }
                    }
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                Menu {
                    Button("Choose file", systemImage: "doc") { pickingFile = true }
                    Button("Choose photo", systemImage: "photo") { pickingPhoto = true }
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 20))
                        .frame(width: 34, height: 40)
                }
                .accessibilityLabel("Attach files")

                TextField("Message Cot…", text: $text, axis: .vertical)
                    .lineLimit(1 ... 6)
                    .focused($focused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                    )

                Button {
                    if canSend {
                        onSend()
                    } else if busy {
                        onStop()
                    }
                } label: {
                    Image(systemName: stopping ? "stop.circle.fill" : "arrow.up.circle.fill")
                        .font(.system(size: 34))
                        .symbolRenderingMode(.hierarchical)
                }
                .disabled(!busy && !canSend)
                .accessibilityLabel(stopping ? "Stop" : busy ? "Queue message" : "Send")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .fileImporter(
            isPresented: $pickingFile,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case let .success(urls): add(urls.map(read))
            case let .failure(error): onError(error.localizedDescription)
            }
        }
        .photosPicker(isPresented: $pickingPhoto, selection: $photo, matching: .images)
        .onChange(of: photo) {
            guard let item = photo else { return }
            photo = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    add([Result { try Attachment.photo(data: data) }])
                } else {
                    onError("Couldn't load that photo.")
                }
            }
        }
    }

    private func read(_ url: URL) -> Result<Attachment, Error> {
        Result {
            // Files outside the app's sandbox need security-scoped access.
            let scoped = url.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }
            return try Attachment.make(name: url.lastPathComponent, data: Data(contentsOf: url))
        }
    }

    private func add(_ results: [Result<Attachment, Error>]) {
        var next = attachments
        for result in results {
            switch result {
            case let .success(attachment): next.append(attachment)
            case let .failure(error): onError(error.localizedDescription); return
            }
        }
        do {
            try Attachment.check(next)
            attachments = next
        } catch {
            onError(error.localizedDescription)
        }
    }
}
