import SwiftUI

extension View {
    /// Slides `drawer` in from the leading edge, over this view.
    func sideDrawer(
        isOpen: Binding<Bool>, @ViewBuilder drawer: () -> some View
    ) -> some View {
        modifier(SideDrawer(isOpen: isOpen, drawer: drawer()))
    }
}

/// A drawer from the leading edge, like the web's history drawer
/// (`history.css`): open it with a button or a swipe from the edge, close it
/// by swiping it back or tapping the dimmed chat beside it.
private struct SideDrawer<Drawer: View>: ViewModifier {
    @Binding var isOpen: Bool
    let drawer: Drawer

    @State private var screenWidth: CGFloat = 390
    @GestureState(resetTransaction: Transaction(animation: .snappy))
    private var drag: CGFloat = 0

    /// How far from the edge a swipe has to start to open the drawer.
    private let edge: CGFloat = 24

    private var width: CGFloat {
        min(screenWidth * 0.85, 340)
    }

    /// 0 closed … 1 open, following the finger while it drags.
    private var reveal: CGFloat {
        min(1, max(0, (isOpen ? 1 : 0) + drag / width))
    }

    func body(content: Content) -> some View {
        ZStack(alignment: .leading) {
            content
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { screenWidth = $0 }
            Color.black
                .opacity(0.3 * reveal)
                .ignoresSafeArea()
                .allowsHitTesting(isOpen)
                .onTapGesture { isOpen = false }
                .accessibilityHidden(true)
            drawer
                .frame(width: width)
                .frame(maxHeight: .infinity)
                .background(Color(.systemBackground).ignoresSafeArea())
                .offset(x: (reveal - 1) * width)
                .allowsHitTesting(isOpen)
                .accessibilityHidden(!isOpen)
        }
        .simultaneousGesture(swipe)
        .animation(.snappy, value: isOpen)
        // The composer's or search field's keyboard shouldn't outlive the switch.
        .onChange(of: isOpen) {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
            )
        }
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 10)
            .updating($drag) { value, state, _ in
                state = tracked(value) ?? 0
            }
            .onEnded { value in
                guard let distance = tracked(value) else { return }
                let flung = value.predictedEndTranslation.width
                if isOpen, distance < -width / 3 || flung < -width / 2 {
                    isOpen = false
                } else if !isOpen, distance > width / 3 || flung > width / 2 {
                    isOpen = true
                }
            }
    }

    /// The horizontal distance this drag moves the drawer, or nil when it
    /// isn't a drawer swipe (mostly vertical, or not from the edge).
    private func tracked(_ value: DragGesture.Value) -> CGFloat? {
        let dx = value.translation.width
        guard abs(dx) > abs(value.translation.height) else { return nil }
        if isOpen {
            return min(0, dx)
        }
        return value.startLocation.x < edge ? max(0, dx) : nil
    }
}
