# Email integration

Each assistant gets its own address, `<alias>@EMAIL_DOMAIN`, with a random
alias. Anyone (or a Gmail forwarding rule) can send mail there; the
assistant files it in an inbox and tells the owner. The model reads it only
when the owner asks, through the `listEmails` / `readEmail` tools, and
never starts a turn because mail arrived.

1. The settings page calls `getEmailStatus`. `EmailChannel.status` allocates
   an alias on first use and records `alias → account` in the global
   `EmailAddresses` Durable Object.
2. Email Routing delivers mail for the domain to the Worker's `email`
   handler (`handler.ts`), which maps the alias to an account and hands the
   raw message to that account's `Assistant`. Unknown aliases bounce.
3. `EmailChannel.receive` parses it and runs `gateEmail`. Mail from the
   owner (including Gmail auto-forwards) and their trusted senders is
   marked trusted. Strangers' mail is accepted but marked untrusted, or
   bounced if the owner turned off "Accept mail from anyone". Gmail's
   forwarding confirmation always gets through. Email Routing has already
   rejected mail failing SPF/DKIM or the sender's DMARC policy.
4. Accepted mail goes into the `emails` table (the newest 200 are kept)
   and the owner gets a web toast and a Telegram message. Untrusted mail is
   labelled "unknown sender" in both, and in what `readEmail` returns; the
   system prompt tells the model to treat it as possible spam or phishing.
   Every body is fenced as untrusted content either way.

SDK `routeAgentEmail` with `createAddressBasedEmailResolver` is deliberately
not used: it takes the instance name from the address, which would expose
`google:<sub>` and let anyone mail any assistant.

## Setup

- `EMAIL_DOMAIN` in `wrangler.jsonc` vars (empty disables the feature).
- In the Cloudflare dashboard, enable Email Routing for that domain and add
  a catch-all rule with the action "Send to a Worker" → this Worker.

## Gmail forwarding

In Gmail: Settings → Forwarding → Add a forwarding address → the
assistant's address. Gmail's confirmation email is let through and its text
sent to the owner, so they can click the link. Then add a filter that
forwards the mail you want the assistant to see. Forwarded mail arrives
with the owner as envelope sender, so it passes the gate.

| File           | What it holds                                             |
| -------------- | --------------------------------------------------------- |
| `config.ts`    | `EmailConfig` (stored in the user's agent), alias helpers |
| `addresses.ts` | `EmailAddresses` DO: alias → account                      |
| `handler.ts`   | The Worker's `email` handler                              |
| `parse.ts`     | MIME → text (postal-mime)                                 |
| `gate.ts`      | Who may reach the assistant by email                      |
| `inbox.ts`     | The `emails` table                                        |
| `channel.ts`   | Address lifecycle and receiving for one assistant         |
