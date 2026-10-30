import PhotosUI
import SwiftUI

/// The message box. Return adds a line; the button sends (queues while the
/// assistant is replying), or stops the turn when the box is empty. The plus button attaches files or
/// photos.
struct ComposerView: View {
    @Binding var text: String
    @Binding var attachments: [Attachment]
    let busy: Bool
    let token: () -> String?
    let onError: (String) -> Void
    let onSend: () -> Void
    let onStop: () -> Void
    @FocusState private var focused: Bool
    @State private var pickingFile = false
    @State private var pickingPhoto = false
    @State private var photo: PhotosPickerItem?
    @State private var voice = VoiceRecorder()

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
            if voice.state != .idle {
                VoiceBarView(voice: voice) {
                    voice.confirm(token: token, onText: append, onError: onError)
                }
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    Menu {
                        Button("Choose file", systemImage: "doc") { pickingFile = true }
                        Button("Choose photo", systemImage: "photo") { pickingPhoto = true }
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(.primary)
                            .frame(width: 38, height: 38)
                            .background(Color(.secondarySystemBackground), in: Circle())
                    }
                    .accessibilityLabel("Attach files")

                    HStack(alignment: .bottom, spacing: 6) {
                        TextField("Message Cot…", text: $text, axis: .vertical)
                            .lineLimit(1 ... 6)
                            .focused($focused)
                            .padding(.leading, 14)
                            .padding(.vertical, 8)

                        trailingButton
                    }
                    .padding(.trailing, 4)
                    // Filled with a hairline outline, as in iMessage.
                    .background(
                        Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 19, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 19, style: .continuous)
                            .strokeBorder(Color(.systemGray4), lineWidth: 1)
                    )
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        // No bar behind the controls, like iMessage: the page background
        // shows through, so the keyboard's rounded corners reveal the same colour.
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

    /// Mic while the box is empty; send, queue or stop once there is something
    /// to do, as in iMessage.
    @ViewBuilder
    private var trailingButton: some View {
        if canSend || busy {
            Button {
                if canSend {
                    onSend()
                } else {
                    onStop()
                }
            } label: {
                Image(systemName: stopping ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 30, height: 30)
            }
            .padding(.bottom, 4)
            .accessibilityLabel(stopping ? "Stop" : busy ? "Queue message" : "Send")
        } else {
            Button {
                voice.start(onError: onError)
            } label: {
                Image(systemName: "mic")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
            }
            .padding(.bottom, 4)
            .accessibilityLabel("Voice input")
        }
    }

    /// The transcript arrives after an upload; append to whatever is typed now.
    private func append(_ spoken: String) {
        text = text.isEmpty ? spoken : "\(text) \(spoken)"
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
