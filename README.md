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
   - `https://runlet.us/auth/callback` (the custom domain in `apps/server/wrangler.jsonc`)
3. Copy `apps/server/.dev.vars.example` to `apps/server/.dev.vars` and fill in the client ID and secret, a random `SESSION_SECRET` (`openssl rand -base64 32`) and your email in `ALLOWED_EMAILS`.

The Pi assistant calls Workers AI over REST, so it also needs `CLOUDFLARE_API_KEY` (an API token with Workers AI access) and your account id in `vars.CLOUDFLARE_ACCOUNT_ID` in `apps/server/wrangler.jsonc`.

## Telegram setup

Each user brings their own bot; the deployment needs no Telegram configuration.

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot` and copy the token.
2. In the deployed app, open **Settings → Integrations → Telegram**, paste the token and click **Connect**. Your assistant stores the token, generates a webhook secret and points the bot at `https://<your-worker>/messengers/telegram/<random id>/webhook`.
3. Click **Open @your_bot and press Start**. The Telegram account that presses Start with that link becomes the bot's owner; everyone else gets "This is a private assistant."

Telegram only delivers webhooks to public `https://` URLs, so a bot connected from `http://localhost` is saved without a webhook; connect it from the deployed Worker. Telegram talks to the Think assistant; the Pi assistant is web-only. `TELEGRAM_API_BASE_URL` in `apps/server/wrangler.jsonc` can point at a self-hosted Bot API server.

## Run locally

```bash
npm install               # all workspaces; also installs the pre-commit hook
npx wrangler login        # or set CLOUDFLARE_API_TOKEN (Workers AI has no local simulator)
npm run dev               # http://localhost:5173
npm run check             # format + lint + typecheck + knip (dead code), as in CI
```

## Deploy

Secrets are read from `apps/server/wrangler.jsonc`, so set them from there:

```bash
cd apps/server
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ALLOWED_EMAILS
npx wrangler secret put CLOUDFLARE_API_KEY
cd ../..
npm run deploy            # → https://runlet.us (also runs on every push to main)
```

## Structure

An npm-workspaces monorepo. See [AGENTS.md](AGENTS.md) for conventions and
[docs/architecture.md](docs/architecture.md) for boundaries and how to add a
client (browser extension, iOS).

```
apps/server/               # @cot/server — Cloudflare Worker
  src/index.ts             #   entry: router + Durable Object exports
  src/http/                #   routes each request to the signed-in user's agent
  src/auth/                #   Google sign-in and signed session cookie
  src/agents/think/        #   Think assistant: DO class, store, model, prompt, tools/
  src/agents/pi/           #   Pi assistant: DO class, model, prompt, tools, stream bridge
  src/agents/common/       #   persona/memory prompt and reminders shared by both
  src/integrations/telegram/ # per-user Telegram bots
  src/tools/               #   sandbox (Container), code runner, knowledge search, browser
  wrangler.jsonc           #   bindings, Durable Objects, migrations
apps/web/                  # @cot/web — React client (its Vite build also bundles the Worker)
  src/app.tsx              #   session state and page switching
  src/pages/chat/          #   chat page and its components
  src/pages/settings/      #   settings page, one file per card
  src/components/          #   shared UI
  src/lib/                 #   client-side API calls and helpers
  src/styles/              #   theme, split by area
packages/shared/           # @cot/shared — contract: routes, AssistantRpc, settings, types
packages/tsconfig/         # @cot/tsconfig — strict TypeScript presets
```
