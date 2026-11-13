import SwiftUI
import UniformTypeIdentifiers

/// The user's knowledge base: documents the assistant searches before
/// answering. Mirrors knowledge-settings.tsx on the web.
struct KnowledgeSection: View {
    @State private var model: KnowledgeModel
    @State private var picking = false

    init(token: @escaping () -> String?) {
        _model = State(initialValue: KnowledgeModel(token: token))
    }

    private static let types = KnowledgeAPI.extensions.compactMap { UTType(filenameExtension: $0) }

    var body: some View {
        Section {
            if let library = model.library {
                if library.docs.isEmpty {
                    Text("No documents yet.").foregroundStyle(.secondary)
                }
                ForEach(library.docs) { doc in
                    row(doc)
                }
                if library.shared > 0 {
                    Text(
                        "The assistant also searches \(library.shared) shared documents from this deployment."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
            } else {
                Text("Loading…").foregroundStyle(.secondary)
            }
            Button(model.uploading > 0 ? "Uploading \(model.uploading)…" : "Upload documents") {
                picking = true
            }
            .disabled(model.uploading > 0 || model.library == nil)
            if let error = model.error {
                Text(error).foregroundStyle(.red)
            }
        } header: {
            Text("Knowledge base")
        } footer: {
            Text(
                "Documents the assistant searches before answering: manuals, price lists, policies, industry references. PDF, Word, Excel, text, Markdown, CSV, HTML and images, up to \(KnowledgeAPI.maxFileBytes / 1_000_000) MB each. A file with the same name replaces the old one."
            )
        }
        .fileImporter(
            isPresented: $picking,
            allowedContentTypes: Self.types,
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case let .success(urls): Task { await model.upload(urls) }
            case let .failure(error): model.error = error.localizedDescription
            }
        }
        .task { await model.refresh() }
        // Re-armed by each listing until nothing is indexing any more.
        .task(id: model.loads) {
            guard model.indexing else { return }
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            await model.refresh()
        }
    }

    private func row(_ doc: KnowledgeDoc) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(doc.name).font(.body.weight(.medium))
            HStack(spacing: 6) {
                StatusPill(status: doc.status)
                if let size = doc.size {
                    Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                }
                if let error = doc.error {
                    Text(error).lineLimit(2)
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .swipeActions {
            Button("Delete", role: .destructive) {
                Task { await model.delete(doc.id) }
            }
            if doc.status == "failed" {
                Button("Retry") {
                    Task { await model.reindex(doc.id) }
                }
            }
        }
    }
}

/// The ready / failed / indexing pill, like `.pill` on the web.
private struct StatusPill: View {
    let status: String

    var body: some View {
        let (label, color): (String, Color) = switch status {
        case "ready": ("ready", .green)
        case "failed": ("failed", .red)
        default: ("indexing…", .secondary)
        }
        Text(label)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 1)
            .foregroundStyle(color)
            .background(color.opacity(0.15), in: Capsule())
    }
}
