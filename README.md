# Cot — personal AI assistant

An OpenClaw-style personal assistant built on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/). The same assistant runs on two agent harnesses, switchable from the header:

- **Think** ([`@cloudflare/think`](https://github.com/cloudflare/agents/tree/main/docs/think)), which runs the agentic loop, stores the conversation and resumes interrupted turns
- **Pi** ([`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core)), wrapped in an `AIChatAgent` for the chat protocol and persistence

Each harness keeps its own chat history; long-term memory is shared.

MVP features:

- **Chat** with streaming replies (Workers AI, no third-party API key)
- **Sign in with Google**: each account gets its own Durable Object (chat history, memory, reminders). Only emails in `ALLOWED_EMAILS` can sign in, and the Worker — not the browser — picks which assistant a request reaches
- **Long-term memory**: the assistant saves facts about you (`remember` / `forget` tools in SQLite) and uses them in later chats. The memories live in the Think assistant; the Pi assistant reads and writes them over RPC
- **Reminders**: "remind me in 10 minutes to…" schedules a task that shows up as an in-app toast, a browser notification and, if you connected a bot, a Telegram message
- **Telegram, with your own bot**: paste a @BotFather token in settings and chat with the same Think assistant (same conversation, memory and reminders) from Telegram. Only you — the account that claims the bot with Start — reach the assistant, in one-to-one chats
- **Settings page** (gear icon, `/settings`), saved per account:
  - **Assistant**: name, reply language and custom instructions, used by both harnesses
  - **Model**: Workers AI (default), OpenAI, Anthropic or Google with your own API key, and the model id. Keys are stored in your assistant's Durable Object and only the last four characters are ever sent back to the browser. Applies to the Think assistant and Telegram; the Pi assistant stays on Workers AI
  - **MCP servers**: add remote MCP servers by URL, including ones that need OAuth (a popup opens; the callback returns through `/chat/mcp-callback`, so it reaches only your own assistant). Their tools are available in every Think chat
  - **Integrations**: Google account, and your Telegram bot (connect with its token, claim, disconnect)
- A calm, minimal chat UI with light and dark mode that works on mobile

## Google sign-in setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application** (configure the OAuth consent screen first if asked).
2. Add these **Authorized redirect URIs**:
   - `http://localhost:5173/auth/callback`
   - `https://runlet.us/auth/callback` (the custom domain in `wrangler.jsonc`)
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the client ID and secret, a random `SESSION_SECRET` (`openssl rand -base64 32`) and your email in `ALLOWED_EMAILS`.

The Pi assistant calls Workers AI over REST, so it also needs `CLOUDFLARE_API_KEY` (an API token with Workers AI access) and your account id in `vars.CLOUDFLARE_ACCOUNT_ID` in `wrangler.jsonc`.

## Telegram setup

Each user brings their own bot; the deployment needs no Telegram configuration.

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot` and copy the token.
2. In the deployed app, open **Settings → Integrations → Telegram**, paste the token and click **Connect**. Your assistant stores the token, generates a webhook secret and points the bot at `https://<your-worker>/messengers/telegram/<random id>/webhook`.
3. Click **Open @your_bot and press Start**. The Telegram account that presses Start with that link becomes the bot's owner; everyone else gets "This is a private assistant."

Telegram only delivers webhooks to public `https://` URLs, so a bot connected from `http://localhost` is saved without a webhook; connect it from the deployed Worker. Telegram talks to the Think assistant; the Pi assistant is web-only. `TELEGRAM_API_BASE_URL` in `wrangler.jsonc` can point at a self-hosted Bot API server.

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
npm run deploy            # → https://runlet.us
```

## Structure

```
src/server.ts     # Think assistant (model, prompt, memory and reminder tools) + Worker routes
src/pi.ts         # Pi assistant
src/reminders.ts  # Reminder logic shared by both
src/prompt.ts     # Shared persona and memory formatting
src/telegram.ts   # Per-user Telegram bots: webhook routing, owner gate, Bot API calls
src/settings.ts   # Settings type, defaults, validation and persona (shared with the client)
src/auth.ts       # Google sign-in and signed session cookie
src/app.tsx       # Sign-in screen, harness switch and chat UI
src/settings-page.tsx # Settings page
src/styles.css    # Theme
```
