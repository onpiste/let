# Email integration

Each assistant gets its own address, `<alias>@EMAIL_DOMAIN`. The alias
defaults to the owner's Google name (`Shixin Guo` → `shixin.guo`), then
their email's local part, then either with a number; the owner can rename
it on the settings page. Aliases are first come, first served. Anyone (or a Gmail forwarding rule) can send mail there; the
assistant files it in an inbox and tells the owner. New mail is read
by the model once, with no tools (`triage.ts`), and sorted into `action`,
`notify` or `ignore` with a one-line summary, so the owner hears about
what matters without asking. The owner reads mail on the Inbox page (web
`/inbox`, iOS envelope button), which marks it read and can archive it; an
unread badge counts what they haven't opened. The chat model reads full
messages only on request, through `listEmails` / `searchEmails` / `readEmail`.
Mail never starts a chat turn by itself: only the owner's **Ask Cot** button
does (`askAboutEmail`), with a message that names the email by id, so
nothing the sender wrote is ever put in the owner's words.

1. The settings page calls `getEmailStatus`. `EmailChannel.status` claims
   the first free candidate alias on first use in the global
   `EmailAddresses` Durable Object (`alias → account`); `setEmailAlias`
   claims another and releases the old one, which then bounces.
2. Email Routing delivers mail for the domain to the Worker's `email`
   handler (`handler.ts`), which maps the alias to an account and hands the
   raw message to that account's `Assistant`. Unknown aliases bounce.
3. `EmailChannel.receive` parses it and runs `gateEmail`. Mail from the
   owner (including Gmail auto-forwards) and their trusted senders is
   marked trusted. Strangers' mail is accepted but marked untrusted, or
   bounced if the owner turned off "Accept mail from anyone". Gmail's
   forwarding confirmation always gets through. Email Routing has already
   rejected mail failing SPF/DKIM or the sender's DMARC policy.
4. Accepted mail goes into the `emails` table, with no cap on how many or
   how long. Strangers are rate limited instead: past 30 emails an hour or
   200 a day (`STRANGER_LIMITS` in `channel.ts`) their mail bounces until
   the window clears. The owner gets a web toast, a push alert and a Telegram message with the summary
   (`action` mail is flagged; `ignore` mail is filed silently; if triage
   fails the plain notice goes out). Untrusted mail is
   labelled "unknown sender" in both, and in what `readEmail` returns; the
   system prompt tells the model to treat it as possible spam or phishing.
   Every body is fenced as untrusted content either way. The event and the
   push carry the email's id and `inboxPath(id)`, so a tap opens it.
5. The clients call `listInbox`, `openEmail`, `archiveEmail`,
   `markAllEmailsRead` and `askAboutEmail` (`mailbox.ts`); each change to the unread count goes out
   to open clients as an `inbox` event for their badge.

SDK `routeAgentEmail` with `createAddressBasedEmailResolver` is deliberately
not used: it takes the instance name from the address, which would expose
`google:<sub>` and let anyone mail any assistant.

## Setup

- `EMAIL_DOMAIN` in `wrangler.jsonc` vars (empty disables the feature).
- In the Cloudflare dashboard, enable Email Routing for that domain and add
  a catch-all rule with the action "Send to a Worker" → this Worker.
- To send (replies and new mail): in the dashboard, turn on Email Sending
  for the same domain and add the DNS records it asks for (SPF/DKIM). The
  `send_email` binding `EMAIL` in `wrangler.jsonc` is already there. Until
  sending is on, the `sendEmail` tool fails with a message saying so and the
  assistant hands the user the draft instead; receiving is unaffected.

## Sending

The chat model has a `sendEmail` tool (`tools/email.ts`): one recipient, a
subject and a plain-text body, plus `inReplyTo` (an inbox id) for replies,
which then carry the original's Message-ID in `In-Reply-To`/`References` so
mail clients thread them. Mail goes out from the assistant's address under
the owner's Google name, so replies come back to the inbox.

- **Always approved.** The tool needs approval in every approval mode, and
  the chip shows the whole draft (`email-draft.tsx`, `EmailDraftView.swift`).
  It is withheld from Telegram and scheduled turns, where nobody can approve.
- **Never on an email's say-so.** The prompt tells the model to send only
  when the user asks in the chat; mail never starts a turn by itself.
- **Capped** at 20 a day per assistant (`DAILY_SEND_LIMIT` in `feature.ts`),
  counted in the `sent_emails` table (`outbox.ts`).
- The binding is called directly (`send.ts`), not through the SDK's
  `sendAgentEmail`, whose `X-Agent-*` headers would expose `google:<sub>`.
  Signed reply routing isn't needed: replies reach the assistant by alias.

## Gmail forwarding

In Gmail: Settings → Forwarding → Add a forwarding address → the
assistant's address. Gmail's confirmation email is let through and its text
sent to the owner, so they can click the link. Then add a filter that
forwards the mail you want the assistant to see. Forwarded mail arrives
with the owner as envelope sender, so it passes the gate.

| File           | What it holds                                                     |
| -------------- | ----------------------------------------------------------------- |
| `config.ts`    | `EmailConfig` (stored in the user's agent), alias helpers         |
| `addresses.ts` | `EmailAddresses` DO: alias → account                              |
| `handler.ts`   | The Worker's `email` handler                                      |
| `parse.ts`     | MIME → text (postal-mime)                                         |
| `gate.ts`      | Who may reach the assistant by email                              |
| `inbox.ts`     | The `emails` table                                                |
| `channel.ts`   | Address lifecycle and receiving for one assistant                 |
| `triage.ts`    | One tool-less model call: category and summary                    |
| `notice.ts`    | The web event and Telegram text for a new email                   |
| `mailbox.ts`   | The owner's inbox actions: list, open, read all, archive, Ask Cot |
| `feature.ts`   | Puts the parts together for the assistant; sending                |
| `send.ts`      | One outgoing email through the `EMAIL` binding                    |
| `outbox.ts`    | The `sent_emails` table, for the daily cap                        |
