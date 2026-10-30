import SwiftUI

/// Replaces the message box while dictating: cancel, a scrolling waveform
/// with the elapsed time, and send. While transcribing, the waveform gives
/// way to a spinner and both buttons are disabled.
struct VoiceBarView: View {
    let voice: VoiceRecorder
    let onConfirm: () -> Void

    private var recording: Bool {
        voice.state == .recording
    }

    private var time: String {
        String(format: "%d:%02d", voice.elapsed / 60, voice.elapsed % 60)
    }

    var body: some View {
        HStack(spacing: 8) {
            Button {
                voice.cancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 34, height: 40)
            }
            .disabled(!recording)
            .accessibilityLabel("Cancel recording")

            HStack(spacing: 10) {
                if recording {
                    HStack(spacing: 3) {
                        ForEach(voice.levels.indices, id: \.self) { index in
                            Capsule()
                                .fill(Color.accentColor)
                                .frame(width: 3, height: max(3, 28 * voice.levels[index]))
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 28, maxHeight: 28)
                    .animation(.linear(duration: 0.06), value: voice.levels)
                    Text(time)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                    Text("Transcribing…")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            .background(
                Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 20, style: .continuous)
            )

            Button(action: onConfirm) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 34))
                    .symbolRenderingMode(.hierarchical)
            }
            .disabled(!recording)
            .accessibilityLabel("Send voice message")
        }
        .sensoryFeedback(.impact, trigger: voice.state)
    }
}
