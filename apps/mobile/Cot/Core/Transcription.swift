import Foundation

/// Voice input: posts a recording to the Worker (`TRANSCRIBE_ROUTE` in
/// `@cot/shared`) and returns the spoken text.
enum Transcription {
    struct Failure: LocalizedError {
        let status: Int
        var errorDescription: String? {
            status == 413 ? "That recording is too long." : "Transcription failed (\(status))."
        }
    }

    private struct Response: Decodable {
        let text: String
    }

    static func transcribe(file: URL, token: String?) async throws -> String {
        var request = URLRequest(url: Config.url("chat/transcribe"))
        request.httpMethod = "POST"
        request.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: file)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw Failure(status: status) }
        return try JSONDecoder().decode(Response.self, from: data).text
    }
}
