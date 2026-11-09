import { useAgent } from "agents/react";
import { useCallback, useEffect, useState } from "react";

import {
  ASSISTANT,
  INBOX_PAGE_SIZE,
  type EmailDetail,
  type EmailSummary
} from "@cot/shared";

import { api } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { parseEvent, unreadOf } from "../../lib/inbox";
import { EmailRow } from "./email-row";
import { EmailView } from "./email-view";

/**
 * The assistant's mailbox: the inbox or the archive, newest first, and one
 * email at a time (`emailId`, from the URL). New mail and changes made on
 * another device refresh the list. Mirrors InboxView.swift.
 */
export function InboxPage({
  emailId,
  onOpen,
  onBack,
  onChat
}: {
  emailId: number | null;
  /** Opens an email, or the list for null (pushes the URL). */
  onOpen: (id: number | null) => void;
  onBack: () => void;
  /** Goes to the chat in use, after "Ask Cot" started one. */
  onChat: () => void;
}) {
  const [archived, setArchived] = useState(false);
  const [emails, setEmails] = useState<EmailSummary[] | null>(null);
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    onOpen: useCallback(() => setEpoch((n) => n + 1), []),
    // New mail or a change elsewhere: reload what is shown.
    onMessage: useCallback((message: MessageEvent) => {
      if (unreadOf(parseEvent(message.data)) !== null) {
        setEpoch((n) => n + 1);
      }
    }, [])
  });

  const fail = (e: unknown) => setError(errorText(e));
  // The email last loaded, while it is still the one the URL asks for.
  const shown = email?.id === emailId ? email : null;

  useEffect(() => {
    if (epoch === 0) return;
    api(agent)
      .listInbox(archived, 0)
      .then((page) => {
        setEmails(page.emails);
        setMore(page.more);
        setUnread(page.unread);
      })
      .catch(fail);
  }, [agent, epoch, archived]);

  useEffect(() => {
    if (epoch === 0 || emailId === null) return;
    api(agent)
      .openEmail(emailId)
      .then((found) => {
        if (found) setEmail(found);
        else setError("That email is no longer in the inbox.");
      })
      .catch(fail);
    // Reopening on every reconnect is what keeps it current; epoch says so.
  }, [agent, epoch, emailId]);

  const loadMore = () =>
    void api(agent)
      .listInbox(archived, emails?.length ?? 0)
      .then((page) => {
        setEmails([...(emails ?? []), ...page.emails]);
        setMore(page.more);
      })
      .catch(fail);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setError(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const ask = (id: number) =>
    run(async () => {
      await api(agent).askAboutEmail(id);
      onChat();
    });

  const archive = (detail: EmailDetail) =>
    run(async () => {
      await api(agent).archiveEmail(detail.id, !detail.archived);
      onOpen(null);
    });

  // The `inbox` event that follows reloads the list.
  const readAll = () => run(() => api(agent).markAllEmailsRead());

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="back-btn"
            onClick={() => (emailId === null ? onBack() : onOpen(null))}
          >
            ← {emailId === null ? "Back" : "Inbox"}
          </button>
          <span className="font-semibold tracking-tight">
            {emailId === null ? "Inbox" : ""}
          </span>
        </div>
      </header>
      <main className="scroll">
        <div className="column settings">
          {error && <p className="error">{error}</p>}
          {emailId !== null ? (
            shown ? (
              <EmailView
                email={shown}
                busy={busy}
                onAsk={() => void ask(shown.id)}
                onArchive={() => void archive(shown)}
              />
            ) : (
              !error && <p className="muted">Loading…</p>
            )
          ) : (
            <>
              <div className="inbox-bar">
                <div className="segmented" role="tablist">
                  {[false, true].map((tab) => (
                    <button
                      key={String(tab)}
                      type="button"
                      role="tab"
                      aria-selected={archived === tab}
                      className={archived === tab ? "on" : ""}
                      onClick={() => setArchived(tab)}
                    >
                      {tab ? "Archived" : "Inbox"}
                    </button>
                  ))}
                </div>
                {!archived && unread > 0 && (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={busy}
                    onClick={() => void readAll()}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {!emails && !error && <p className="muted">Loading…</p>}
              {emails?.length === 0 && (
                <p className="muted">
                  {archived
                    ? "Nothing archived."
                    : "No mail yet. Your address is on the settings page."}
                </p>
              )}
              {emails && emails.length > 0 && (
                <div className="card email-list">
                  {emails.map((summary) => (
                    <EmailRow
                      key={summary.id}
                      email={summary}
                      onOpen={() => onOpen(summary.id)}
                    />
                  ))}
                </div>
              )}
              {more && (
                <button type="button" className="link-btn" onClick={loadMore}>
                  Older mail ({INBOX_PAGE_SIZE} more)
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
