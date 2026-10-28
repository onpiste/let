import SwiftUI

/// The chat screen.
struct ChatView: View {
    let user: User
    let auth: AuthModel

    @State private var store: ChatStore
    @State private var input = ""
    @State private var attachments: [Attachment] = []
    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showTasks = false
    @Environment(\.scenePhase) private var scenePhase

    init(user: User, auth: AuthModel) {
        self.user = user
        self.auth = auth
        _store = State(initialValue: ChatStore(token: { auth.token }))
    }

    private var waiting: Bool {
        store.busy && (store.messages.last?.isUser ?? true)
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        if store.messages.isEmpty {
                            EmptyStateView(user: user, onSuggestion: send)
                        }
                        ForEach(store.messages) { message in
                            MessageRow(
                                message: message,
                                toolLabels: store.mcp?.toolLabels ?? [:],
                                onApproval: store.respond(toApproval:approved:)
                            )
                        }
                        if waiting {
                            TypingDots()
                        }
                        if let error = store.errorText {
                            Text(error).font(.footnote).foregroundStyle(.red)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: store.messages) { scrollToEnd(proxy) }
                .onChange(of: waiting) { scrollToEnd(proxy) }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 0) {
                    QueuedView(queue: store.queue, onRemove: store.removeQueued)
                    ComposerView(
                        text: $input, attachments: $attachments, busy: store.busy,
                        onError: { store.report($0) },
                        onSend: { send(input) }, onStop: store.stopTurn
                    )
                }
            }
            .overlay(alignment: .top) {
                if let notice = store.notice {
                    NoticeBanner(notice: notice) { store.notice = nil }
                }
            }
            .animation(.default, value: store.notice)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .sheet(isPresented: $showTasks) {
            TasksView(store: store) { input = $0 }
        }
        .sheet(isPresented: $showHistory) {
            HistoryView(store: store)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(user: user, auth: auth)
        }
        .task {
            store.onConnectionLost = { Task { await auth.validate() } }
            store.start()
        }
        .onDisappear { store.disconnect() }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                store.resume()
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            HStack(spacing: 6) {
                Text("Cot").font(.headline)
                Circle()
                    .fill(store.connected ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                    .accessibilityLabel(store.connected ? "Connected" : "Reconnecting")
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button("Tasks", systemImage: "calendar") { showTasks = true }
            Button("History", systemImage: "clock") { showHistory = true }
            if !store.messages.isEmpty {
                Button("New chat", systemImage: "square.and.pencil", action: store.startNewChat)
            }
            Button("Settings", systemImage: "gearshape") { showSettings = true }
        }
    }

    private func send(_ text: String) {
        Reminders.requestPermission()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        store.send(text, attachments: attachments)
        input = ""
        attachments = []
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo("end", anchor: .bottom) }
    }
}

/// Three dots while waiting for the assistant's first token.
private struct TypingDots: View {
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0 ..< 3, id: \.self) { index in
                Circle()
                    .fill(.secondary)
                    .frame(width: 7, height: 7)
                    .phaseAnimator([0.3, 1.0]) { view, opacity in
                        view.opacity(opacity)
                    } animation: { _ in
                        .easeInOut(duration: 0.5).delay(Double(index) * 0.15)
                    }
            }
        }
        .padding(.vertical, 6)
    }
}

/// A reminder or new-mail notice, dismissed by tap or after a few seconds.
private struct NoticeBanner: View {
    let notice: ChatStore.Notice
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(notice.icon)
            VStack(alignment: .leading, spacing: 2) {
                Text(notice.title).font(.subheadline.weight(.semibold))
                Text(notice.text).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .transition(.move(edge: .top).combined(with: .opacity))
        .onTapGesture(perform: onDismiss)
        .task(id: notice.id) {
            try? await Task.sleep(for: .seconds(6))
            onDismiss()
        }
    }
}
