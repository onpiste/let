# Cot — personal AI assistant

An OpenClaw-style personal assistant built on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/). The same assistant runs on two agent harnesses, switchable from the header:

- **Think** ([`@cloudflare/think`](https://github.com/cloudflare/agents/tree/main/docs/think)), which runs the agentic loop, stores the conversation and resumes interrupted turns
- **Pi** ([`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core)), wrapped in an `AIChatAgent` for the chat protocol and persistence

Each harness keeps its own chat history; long-term memory is shared.

MVP features:

- **Chat** with streaming replies (Workers AI, no third-party API key)
- **Sign in with Google**: each account gets its own Durable Object (chat history, memory, reminders). Only emails in `ALLOWED_EMAILS` can sign in, and the Worker — not the browser — picks which assistant a request reaches
- **Long-term memory**: the assistant saves facts about you (`remember` / `forget` tools in SQLite) and uses them in later chats. The memories live in the Think assistant; the Pi assistant reads and writes them over RPC
- **Reminders**: "remind me in 10 minutes to…" schedules a task that shows up as an in-app toast, a browser notification and, if linked, a Telegram message
- **Telegram**: link your Telegram account from the web app and chat with the same Think assistant (same conversation, memory and reminders) from Telegram. Only linked accounts in one-to-one chats reach an assistant
- A calm, minimal chat UI with light and dark mode that works on mobile

## Google sign-in setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application** (configure the OAuth consent screen first if asked).
2. Add these **Authorized redirect URIs**:
   - `http://localhost:5173/auth/callback`
   - `https://cot-assistant.<your-subdomain>.workers.dev/auth/callback`
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the client ID and secret, a random `SESSION_SECRET` (`openssl rand -base64 32`) and your email in `ALLOWED_EMAILS`.

The Pi assistant calls Workers AI over REST, so it also needs `CLOUDFLARE_API_KEY` (an API token with Workers AI access) and your account id in `vars.CLOUDFLARE_ACCOUNT_ID` in `wrangler.jsonc`.

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and note its token and username.
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and a random `TELEGRAM_WEBHOOK_SECRET_TOKEN` (`openssl rand -hex 32`).
3. Sign in to the deployed app and click the paper-plane button, then press **Start** in Telegram. The first link also points the bot's webhook at `https://<your-worker>/messengers/telegram/webhook`.

Telegram only delivers webhooks to public `https://` URLs, so on `localhost` the button still creates a link but does not register the webhook; use the deployed Worker or a tunnel. Telegram talks to the Think assistant; the Pi assistant is web-only.

## Run locally

```bash
npm install
npx wrangler login        # or set CLOUDFLARE_API_TOKEN (Workers AI has no local simulator)
npm run dev               # http://localhost:5173
```

## Deploy

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ALLOWED_EMAILS
npx wrangler secret put CLOUDFLARE_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_BOT_USERNAME
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET_TOKEN
npm run deploy            # → https://cot-assistant.<your-subdomain>.workers.dev
```

## Structure

```
src/server.ts     # Think assistant (model, prompt, memory and reminder tools) + Worker routes
src/pi.ts         # Pi assistant
src/reminders.ts  # Reminder logic shared by both
src/prompt.ts     # Shared persona and memory formatting
src/telegram.ts   # Telegram webhook, account linking and Bot API calls
src/auth.ts       # Google sign-in and signed session cookie
src/app.tsx       # Sign-in screen, harness switch and chat UI
src/styles.css    # Theme
```
