import SwiftUI

/// The history drawer's top bar. At rest it is a title and round buttons;
/// search hides behind the magnifier, whose border fills like a progress ring
/// as the list is pulled down, and which morphs into the search field when
/// tapped or let go past the threshold. Mirrors the head of `history-panel.tsx`.
struct HistoryHeader: View {
    @Binding var query: String
    @Binding var searching: Bool
    /// 0 … 1: how far the list has been pulled towards opening search.
    let pull: CGFloat
    let onNew: () -> Void
    let onClose: () -> Void

    @FocusState private var focused: Bool
    @Namespace private var morph

    private var armed: Bool {
        pull >= 1
    }

    var body: some View {
        Group {
            if searching {
                field
            } else {
                bar
            }
        }
        .padding(.leading, searching ? 12 : 20)
        .padding(.trailing, 12)
        .padding(.vertical, 8)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: armed)
        .sensoryFeedback(.impact(weight: .light), trigger: armed) { _, new in new }
    }

    private var bar: some View {
        HStack(spacing: 10) {
            Text("History").font(.title3.bold())
            Spacer()
            round("square.and.pencil", label: "New chat", action: onNew)
            searchButton
            round("xmark", label: "Close", action: onClose)
        }
    }

    /// Icon only, never a label: the ring on its border fills with the pull,
    /// then the circle fills with the tint once letting go would open search.
    private var searchButton: some View {
        Button(action: open) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(armed ? Color.white : Color.primary)
                .frame(width: 36, height: 36)
                .background {
                    Circle()
                        .fill(armed ? Color.accentColor : Color(.secondarySystemBackground))
                        .matchedGeometryEffect(id: "search", in: morph)
                }
                .overlay {
                    Circle()
                        .trim(from: 0, to: armed ? 1 : pull)
                        .stroke(
                            Color.accentColor,
                            style: StrokeStyle(lineWidth: 2.5, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        .opacity(pull > 0 ? 1 : 0)
                }
                .scaleEffect(armed ? 1.12 : 1 + 0.06 * pull)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search chats")
    }

    private var field: some View {
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search chats", text: $query)
                    .focused($focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
            .font(.subheadline)
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background {
                Capsule()
                    .fill(Color(.secondarySystemBackground))
                    .matchedGeometryEffect(id: "search", in: morph)
            }
            round("xmark", label: "Cancel search", action: cancel)
                .transition(.scale.combined(with: .opacity))
        }
        .task { focused = true }
    }

    private func round(
        _ icon: String, label: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .frame(width: 36, height: 36)
                .background(Color(.secondarySystemBackground), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func open() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) { searching = true }
    }

    private func cancel() {
        query = ""
        focused = false
        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) { searching = false }
    }
}
