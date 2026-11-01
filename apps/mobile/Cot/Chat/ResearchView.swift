import SwiftUI

/// Deep Research runs still going, above the composer, so a run that takes
/// minutes doesn't look stuck. Mirrors research-list.tsx.
struct ResearchView: View {
    let jobs: [ResearchJob]

    var body: some View {
        if !jobs.isEmpty {
            TimelineView(.periodic(from: .now, by: 15)) { context in
                VStack(spacing: 6) {
                    ForEach(jobs) { job in
                        row(job, now: context.date)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
            }
            .background(.bar)
        }
    }

    private func row(_ job: ResearchJob, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Circle()
                    .fill(job.problem == nil ? Color.accentColor : .orange)
                    .frame(width: 8, height: 8)
                Text("Researching")
                    .font(.footnote.weight(.medium))
                Text("· \(job.topic)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(job.elapsed(at: now))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if let problem = job.problem {
                note("Can't reach the run right now, retrying: \(problem)")
                    .foregroundStyle(.orange)
            } else if let progress = job.progress {
                note(progress).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private func note(_ text: String) -> Text {
        Text(text).font(.caption)
    }
}
