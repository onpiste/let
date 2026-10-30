import AVFoundation
import Observation

/// Records the microphone to an AAC file and turns it into text on the
/// server. The composer appends the result to its text field.
@MainActor @Observable
final class VoiceRecorder {
    enum State { case idle, recording, transcribing }

    private(set) var state = State.idle
    private var recorder: AVAudioRecorder?
    private let file = FileManager.default.temporaryDirectory.appendingPathComponent("voice.m4a")

    /// Starts recording, or stops and transcribes if already recording.
    func toggle(
        token: @escaping () -> String?,
        onText: @escaping (String) -> Void,
        onError: @escaping (String) -> Void
    ) {
        switch state {
        case .idle:
            Task {
                guard await AVAudioApplication.requestRecordPermission() else {
                    onError("Allow microphone access in Settings to use voice input.")
                    return
                }
                do { try start() } catch { onError(error.localizedDescription) }
            }
        case .recording:
            recorder?.stop()
            recorder = nil
            state = .transcribing
            Task {
                defer { state = .idle }
                do {
                    let text = try await Transcription.transcribe(file: file, token: token())
                    if !text.isEmpty { onText(text) }
                } catch {
                    onError(error.localizedDescription)
                }
            }
        case .transcribing:
            break
        }
    }

    private func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1
        ]
        let next = try AVAudioRecorder(url: file, settings: settings)
        guard next.record() else { throw CocoaError(.fileWriteUnknown) }
        recorder = next
        state = .recording
    }
}
