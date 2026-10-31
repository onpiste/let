import type { UIMessage } from "ai";

// The last conversation, kept in the browser so the chat opens on it at once
// instead of blocking on a request. The server stays the truth: its list
// replaces this one when the socket connects. Tagged with the user so another
// account on the same browser never sees it. Mirrors ChatCache.swift.
const KEY = "last-chat";

export function loadChatCache(userId: string): UIMessage[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    // Trust boundary: our own JSON from an earlier session.
    const saved = raw
      ? (JSON.parse(raw) as { user?: string; messages?: UIMessage[] })
      : null;
    return saved?.user === userId && saved.messages ? saved.messages : null;
  } catch {
    return null;
  }
}

export function saveChatCache(userId: string, messages: UIMessage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ user: userId, messages }));
  } catch {
    // Storage full or blocked; the cache is only a speed-up.
  }
}

export function clearChatCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
