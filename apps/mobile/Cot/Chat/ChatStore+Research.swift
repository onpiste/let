import Foundation

/// The Deep Research runs still going: loaded on every (re)connect, since
/// runs go on while the app is closed, then kept current by the server's
/// `research-jobs` broadcasts. Mirrors use-research-jobs.ts.
extension ChatStore {
    func loadResearch() {
        Task {
            if let jobs = try? await socket.call("listResearch", [])
                .decoded(as: [ResearchJob].self)
            {
                researchJobs = jobs
            }
        }
    }

    func handleResearchJobs(_ frame: JSONValue) {
        if let jobs = frame["jobs"].flatMap({ try? $0.decoded(as: [ResearchJob].self) }) {
            researchJobs = jobs
        }
    }
}
