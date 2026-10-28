import { useEffect } from "react";

/**
 * Reconnects a dropped socket as soon as the page is usable again. A
 * backgrounded iOS WebView or a network change leaves a dead socket that the
 * client only notices after its own timeout, so the status dot stays grey.
 */
export function useReconnectOnResume(socket: {
  readyState: number;
  reconnect: () => void;
}) {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "hidden") return;
      if (socket.readyState !== WebSocket.OPEN) socket.reconnect();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [socket]);
}
