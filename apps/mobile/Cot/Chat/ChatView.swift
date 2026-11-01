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
    /// Auto-scroll with new content until the user drags the list away.
    @State private var following = true
    @State private var endVisible = true
    @Environment(\.scenePhase) private var scenePhase

    init(user: User, auth: AuthModel) {
        self.user = user
        self.auth = auth
        _store = State(initialValue: ChatStore(userID: user.id, token: { auth.token }))
    }

    private var waiting: Bool {
        store.busy && (store.messages.last?.isUser ?? true)
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        if store.loaded, store.messages.isEmpty {
                            EmptyStateView(user: user, onSuggestion: send)
                        }
                        ForEach(ChatRow.rows(store.messages), id: \.message.id) { row in
                            if let sent = row.message.createdAt, let before = row.previous,
                               sent.timeIntervalSince(before) >= 15 * 60
                            {
                                TimeDivider(date: sent)
                            }
                            MessageRow(
                                message: row.message,
                                toolLabels: store.mcp?.toolLabels ?? [:],
                                streaming: store.busy && row.message.id == store.messages.last?.id,
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
                            .onAppear {
                                endVisible = true
                                following = true
                            }
                            .onDisappear { endVisible = false }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .scrollDismissesKeyboard(.interactively)
                // A chat not shown before has nothing cached: spin until the
                // server sends it rather than show a blank screen.
                .overlay {
                    if !store.loaded, store.messages.isEmpty {
                        ProgressView().controlSize(.large)
                    }
                }
                // The cached chat is there from the first frame, so no
                // messages change fires; start at the newest message.
                .defaultScrollAnchor(.bottom)
                .onAppear { scrollToEnd(proxy) }
                // Dragging toward older messages takes over from auto-scroll,
                // including mid-stream; it resumes once the end is back in view.
                .simultaneousGesture(
                    DragGesture(minimumDistance: 8)
                        .onChanged {
                            if $0.translation.height > 0 {
                                following = false
                            }
                        }
                        .onEnded { _ in
                            if endVisible {
                                following = true
                            }
                        }
                )
                .onChange(of: store.messages) {
                    if following {
                        scrollToEnd(proxy)
                    }
                }
                .onChange(of: waiting) {
                    if following {
                        scrollToEnd(proxy)
                    }
                }
                .overlay(alignment: .bottom) {
                    if !following, !endVisible {
                        Button {
                            following = true
                            scrollToEnd(proxy)
                        } label: {
                            Image(systemName: "arrow.down")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(width: 36, height: 36)
                                .background(.regularMaterial, in: Circle())
                                .overlay(Circle().strokeBorder(Color(.systemGray4), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, 8)
                        .transition(.scale.combined(with: .opacity))
                        .accessibilityLabel("Scroll to latest")
                    }
                }
                .animation(.default, value: following || endVisible)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 0) {
                    ResearchView(jobs: store.researchJobs)
                    QueuedView(queue: store.queue, onRemove: store.removeQueued)
                    ComposerView(
                        text: $input, attachments: $attachments, busy: store.busy,
                        token: { auth.token }, onError: { store.report($0) },
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
        .sideDrawer(isOpen: $showHistory) {
            HistoryView(store: store, isOpen: showHistory) { showHistory = false }
        }
        .sheet(isPresented: $showTasks) {
            TasksView(store: store) { input = $0 }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(user: user, auth: auth)
        }
        .task {
            store.onConnectionLost = { Task { await auth.validate() } }
            store.start()
            Reminders.registerIfAllowed()
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
        ToolbarItem(placement: .topBarLeading) {
            HStack(spacing: 8) {
                Button("History", systemImage: "clock") { showHistory = true }
                    .labelStyle(.iconOnly)
                Circle()
                    .fill(store.connected ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                    .accessibilityLabel(store.connected ? "Connected" : "Reconnecting")
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button("Tasks", systemImage: "calendar") { showTasks = true }
            Button("New chat", systemImage: "square.and.pencil", action: store.startNewChat)
            Button("Settings", systemImage: "gearshape") { showSettings = true }
        }
    }

    private func send(_ text: String) {
        Reminders.requestPermission()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        following = true
        store.send(text, attachments: attachments)
        input = ""
        attachments = []
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo("end", anchor: .bottom) }
    }
}

/// When the next message was sent, after a long gap in the conversation.
/// A message and the time of the one before it, worked out together. A lazy
/// row is built later than the list, so looking the neighbour up by index
/// then could run past the end of a list that has since shrunk (switching or
/// clearing chats, or the server sending a shorter one) and crash.
private struct ChatRow {
    let message: ChatMessage
    let previous: Date?

    static func rows(_ messages: [ChatMessage]) -> [ChatRow] {
        zip(messages, [nil] + messages.map(\.createdAt)).map {
            ChatRow(message: $0, previous: $1)
        }
    }
}

private struct TimeDivider: View {
    let date: Date

    private var text: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return date.formatted(.dateTime.hour().minute())
        }
        if calendar.isDate(date, equalTo: .now, toGranularity: .year) {
            return date.formatted(.dateTime.month().day().hour().minute())
        }
        return date.formatted(.dateTime.year().month().day().hour().minute())
    }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
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
