/**
 * The chat area while a conversation's messages load. Mirrors the
 * `ProgressView` overlay in ChatView.swift.
 */
export function ChatLoading() {
  return (
    <main className="scroll chat-loading" aria-busy>
      <span className="spinner spinner-lg" aria-label="Loading chat" />
    </main>
  );
}
