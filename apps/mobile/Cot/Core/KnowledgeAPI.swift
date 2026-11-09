import Foundation

/// The knowledge base over HTTP (`KNOWLEDGE_ROUTE` in @cot/shared
/// knowledge.ts). The Worker picks the signed-in user's own library.
enum KnowledgeAPI {
    /// Mirrors KNOWLEDGE_LIMITS and KNOWLEDGE_EXTENSIONS in @cot/shared.
    static let maxFileBytes = 4_000_000
    static let extensions = [
        "pdf", "txt", "md", "csv", "json", "yaml", "yml", "log", "html", "htm", "xml",
        "docx", "xlsx", "odt", "ods", "png", "jpg", "jpeg", "webp"
    ]

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? {
            message
        }
    }

    private struct ErrorBody: Decodable {
        let error: String
    }

    private static let route = "chat/knowledge"

    static func list(token: String?) async throws -> KnowledgeLibrary {
        try await send(request(Config.url(route), "GET", token))
    }

    static func delete(_ id: String, token: String?) async throws -> KnowledgeLibrary {
        try await send(request(docURL(id), "DELETE", token))
    }

    static func reindex(_ id: String, token: String?) async throws -> KnowledgeLibrary {
        try await send(request(docURL(id).appendingPathComponent("reindex"), "POST", token))
    }

    /// Sends one picked file; it indexes on the server afterwards.
    static func upload(file: URL, token: String?) async throws {
        let name = file.lastPathComponent
        guard extensions.contains(file.pathExtension.lowercased()) else {
            throw Failure(message: "\(name): .\(file.pathExtension) files aren't supported.")
        }
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= maxFileBytes else {
            throw Failure(message: "\(name): files can be up to \(maxFileBytes / 1_000_000) MB.")
        }
        guard var components = URLComponents(url: Config.url(route), resolvingAgainstBaseURL: false)
        else { throw Failure(message: "Bad server URL.") }
        components.queryItems = [URLQueryItem(name: "name", value: name)]
        // URLComponents leaves "+" alone, which the Worker would read as a space.
        let query = components.percentEncodedQuery ?? ""
        components.percentEncodedQuery = query.replacingOccurrences(of: "+", with: "%2B")
        guard let url = components.url else { throw Failure(message: "Bad file name.") }
        var req = request(url, "POST", token)
        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.upload(for: req, fromFile: file)
        try check(data, response, name: name)
    }

    private static func docURL(_ id: String) -> URL {
        Config.url(route).appendingPathComponent(id)
    }

    private static func request(_ url: URL, _ method: String, _ token: String?) -> URLRequest {
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private static func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(data, response, name: nil)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func check(_ data: Data, _ response: URLResponse, name: String?) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status != 200 else { return }
        let reason = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            ?? "Request failed (\(status))."
        throw Failure(message: name.map { "\($0): \(reason)" } ?? reason)
    }
}
