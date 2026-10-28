import Foundation

/// A scheduled task (ScheduledTask in @cot/shared tasks.ts).
struct ScheduledTask: Decodable, Identifiable, Equatable {
    struct Schedule: Decodable, Equatable {
        let kind: String
        let at: String?
        let cron: String?
        let seconds: Int?
    }

    let id: String
    let description: String
    let schedule: Schedule
    let nextRun: String?
    let paused: Bool

    private static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: iso)
    }

    private static func format(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    var scheduleText: String {
        switch schedule.kind {
        case "once":
            return "Once, " + (Self.date(schedule.at).map(Self.format) ?? "")
        case "cron":
            return "Repeats (\(schedule.cron ?? ""))"
        default:
            let seconds = schedule.seconds ?? 0
            return seconds >= 60 && seconds % 60 == 0 ? "Every \(seconds / 60) min" : "Every \(seconds) s"
        }
    }

    var statusText: String {
        if paused { return scheduleText + " · Paused" }
        guard let next = Self.date(nextRun) else { return scheduleText }
        return scheduleText + " · Next " + Self.format(next)
    }
}
