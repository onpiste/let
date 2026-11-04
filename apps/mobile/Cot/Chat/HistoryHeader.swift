import SwiftUI

/// The history drawer's top bar. At rest it is a title and round buttons;
/// search hides behind the magnifier, which fills a ring and then grows into a
/// "Search" pill as the list is pulled down, and morphs into the search field
/// when tapped or let go. Mirrors the head of `history-panel.tsx`.
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

    private var searchButton: some View {
        Button(action: open) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                if armed {
                    Text("Search").transition(.opacity.combined(with: .scale(scale: 0.6)))
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(armed ? Color.white : Color.primary)
            .padding(.horizontal, armed ? 14 : 0)
            .frame(minWidth: 36, minHeight: 36)
            .background {
                Capsule()
                    .fill(armed ? Color.accentColor : Color(.secondarySystemBackground))
                    .matchedGeometryEffect(id: "search", in: morph)
            }
            // The ring fills with the pull until the pill takes over.
            .overlay {
                if !armed, pull > 0 {
                    Circle()
                        .trim(from: 0, to: pull)
                        .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
            .scaleEffect(armed ? 1.05 : 1 + 0.1 * pull)
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
