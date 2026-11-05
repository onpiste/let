import Foundation
import Observation

/// Mirrors KnowledgeDoc in @cot/shared knowledge.ts.
struct KnowledgeDoc: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let size: Int?
    /// "indexing", "ready" or "failed".
    let status: String
    let error: String?
    let createdAt: String?
}

/// Mirrors KnowledgeLibrary in @cot/shared knowledge.ts.
struct KnowledgeLibrary: Decodable, Equatable {
    let docs: [KnowledgeDoc]
    let shared: Int
}

/// The knowledge base section's state, the counterpart of the web's
/// knowledge-settings.tsx. It talks HTTP, not the settings socket.
@MainActor
@Observable
final class KnowledgeModel {
    private(set) var library: KnowledgeLibrary?
    private(set) var uploading = 0
    /// Bumped by every request, so the view's poll re-arms even when nothing changed.
    private(set) var loads = 0
    var error: String?

    private let token: () -> String?

    init(token: @escaping () -> String?) {
        self.token = token
    }

    var indexing: Bool {
        library?.docs.contains { $0.status == "indexing" } ?? false
    }

    func refresh() async {
        await run { [self] in library = try await KnowledgeAPI.list(token: token()) }
    }

    /// One file at a time, so each counts against the limit before the next.
    func upload(_ files: [URL]) async {
        error = nil
        uploading = files.count
        var failed: [String] = []
        for file in files {
            let scoped = file.startAccessingSecurityScopedResource()
            do {
                try await KnowledgeAPI.upload(file: file, token: token())
            } catch {
                failed.append(error.localizedDescription)
            }
            if scoped { file.stopAccessingSecurityScopedResource() }
            uploading -= 1
        }
        await refresh()
        if !failed.isEmpty { error = failed.joined(separator: "\n") }
    }

    func delete(_ id: String) async {
        await run { [self] in library = try await KnowledgeAPI.delete(id, token: token()) }
    }

    func reindex(_ id: String) async {
        await run { [self] in library = try await KnowledgeAPI.reindex(id, token: token()) }
    }

    private func run(_ work: () async throws -> Void) async {
        error = nil
        defer { loads += 1 }
        do {
            try await work()
        } catch {
            DevLog.warn("knowledge", "Knowledge request failed", ["error": String(describing: error)])
            self.error = error.localizedDescription
        }
    }
}
