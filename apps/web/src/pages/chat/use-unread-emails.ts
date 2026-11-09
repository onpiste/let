import { useCallback, useState } from "react";

import type { AssistantRpc } from "@cot/shared";

import { unreadOf } from "../../lib/inbox";

/**
 * The unread count on the inbox button: loaded when the socket opens, then
 * kept current by `email` and `inbox` events (mail read or archived on
 * another device). Mirrors `ChatStore.unreadEmails` on iOS.
 */
export function useUnreadEmails() {
  const [unread, setUnread] = useState(0);

  const onEvent = useCallback((event: Record<string, unknown>) => {
    const count = unreadOf(event);
    if (count !== null) setUnread(count);
  }, []);

  const load = useCallback((rpc: AssistantRpc) => {
    rpc
      .listInbox(false, 0)
      .then((page) => setUnread(page.unread))
      // The deployment may have email turned off; the badge just stays empty.
      .catch(() => setUnread(0));
  }, []);

  return { unread, onEvent, load };
}
