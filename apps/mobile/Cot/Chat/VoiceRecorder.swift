import AVFoundation
import Observation

/// Records the microphone to an AAC file and turns it into text on the
/// server. `confirm` transcribes and hands the text over to be sent; `cancel`
/// discards the recording. `levels` and `elapsed` drive the recording bar.
@MainActor @Observable
final class VoiceRecorder {
    enum State { case idle, recording, transcribing }

    static let barCount = 36

    private(set) var state = State.idle
    /// Recent loudness, oldest first, each 0...1.
    private(set) var levels = [CGFloat](repeating: 0, count: barCount)
    private(set) var elapsed = 0
    private var recorder: AVAudioRecorder?
    private var meter: Task<Void, Never>?
    private let file = FileManager.default.temporaryDirectory.appendingPathComponent("voice.m4a")

    func start(onError: @escaping (String) -> Void) {
        guard state == .idle else { return }
        Task {
            guard await AVAudioApplication.requestRecordPermission() else {
                onError("Allow microphone access in Settings to use voice input.")
                return
            }
            do {
                try begin()
            } catch {
                onError(error.localizedDescription)
            }
        }
    }

    func cancel() {
        guard state == .recording else { return }
        halt()
        try? FileManager.default.removeItem(at: file)
        state = .idle
    }

    func confirm(
        token: @escaping () -> String?,
        onText: @escaping (String) -> Void,
        onError: @escaping (String) -> Void
    ) {
        guard state == .recording else { return }
        halt()
        state = .transcribing
        Task {
            defer { state = .idle }
            do {
                let text = try await Transcription.transcribe(file: file, token: token())
                if text.isEmpty {
                    onError("Didn't catch that. Try again.")
                } else {
                    onText(text)
                }
            } catch {
                onError(error.localizedDescription)
            }
        }
    }

    private func halt() {
        meter?.cancel()
        meter = nil
        recorder?.stop()
        recorder = nil
    }

    private func begin() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1
        ]
        let next = try AVAudioRecorder(url: file, settings: settings)
        next.isMeteringEnabled = true
        guard next.record() else { throw CocoaError(.fileWriteUnknown) }
        recorder = next
        levels = [CGFloat](repeating: 0, count: Self.barCount)
        elapsed = 0
        state = .recording
        meter = Task { [weak self] in
            while !Task.isCancelled {
                self?.sample()
                try? await Task.sleep(for: .milliseconds(60))
            }
        }
    }

    private func sample() {
        guard let recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        // dB to linear; speech sits low, so boost it to keep quiet voices moving.
        let linear = CGFloat(pow(10, recorder.averagePower(forChannel: 0) / 20))
        levels.removeFirst()
        levels.append(min(1, linear * 4))
        elapsed = Int(recorder.currentTime)
    }
}
