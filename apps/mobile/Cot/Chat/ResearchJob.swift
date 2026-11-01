import Foundation

/// A Deep Research run still going (ResearchJob in @cot/shared research.ts).
struct ResearchJob: Decodable, Identifiable, Equatable {
    let id: String
    let topic: String
    /// Epoch milliseconds.
    let startedAt: Double
    let progress: String?
    let problem: String?

    func elapsed(at now: Date) -> String {
        let minutes = max(0, Int((now.timeIntervalSince1970 * 1000 - startedAt) / 60000))
        return minutes < 1 ? "just started" : "\(minutes) min"
    }
}
