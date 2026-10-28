import SwiftUI

private let suggestions = [
    "帮我规划一下今天要做的事",
    "Remind me in 10 minutes to stretch",
    "我叫什么名字？你还记得我什么？",
    "Help me write a polite follow-up email",
]

/// Time-of-day greeting for the empty chat and sign-in screens.
func greeting(at date: Date = Date()) -> String {
    switch Calendar.current.component(.hour, from: date) {
    case ..<5: "Still up?"
    case ..<12: "Good morning"
    case ..<18: "Good afternoon"
    default: "Good evening"
    }
}

/// The greeting and starter prompts shown before the first message.
struct EmptyStateView: View {
    let user: User
    let onSuggestion: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(greeting()), \(user.firstName)")
                .font(.largeTitle.bold())
            Text("I'm Cot, your personal assistant. What's on your mind?")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button(suggestion) { onSuggestion(suggestion) }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.roundedRectangle(radius: 14))
                        .tint(.primary)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 48)
    }
}
