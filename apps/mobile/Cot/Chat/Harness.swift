import Foundation

/// The two agent harnesses (HARNESSES in @cot/shared routes.ts). Each keeps
/// its own chat history; long-term memory is shared.
enum Harness: String, CaseIterable, Identifiable {
    case think
    case pi

    var id: String { rawValue }
    var basePath: String { rawValue == "think" ? "chat" : "pi" }
    var label: String { rawValue == "think" ? "Think" : "Pi" }

    private static let key = "cot.harness"

    static var saved: Harness {
        UserDefaults.standard.string(forKey: key).flatMap(Harness.init(rawValue:)) ?? .think
    }

    func save() {
        UserDefaults.standard.set(rawValue, forKey: Self.key)
    }
}
