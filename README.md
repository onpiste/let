# Cot — your own AI assistant, in an afternoon

Cot is a **template for building a personal AI assistant** in the spirit of
Muse and [OpenClaw](https://github.com/openclaw/openclaw):
an assistant that knows you, remembers what matters, reminds you of things and
meets you where you already are (web, Telegram, …). Fork it, give it a name and
a domain, and deploy it for yourself, your family or a small business.

It runs entirely on Cloudflare (one Worker plus Durable Objects), so there are
no servers to operate, the free tier goes a long way, and every signed-in
account gets its own isolated assistant with its own chat history, memory,
reminders and settings.

**Who it is for**

- **Individuals** who want a private assistant they own, with their data in
  their own Cloudflare account and their choice of model.
- **Small and medium businesses** that want a branded assistant for their team
  (or a handful of customers): allow-list who can sign in, add the company's
  own tools and MCP servers, and connect the channels people already use.
- **Developers** who want a clean, strict, well-structured starting point for
  an agent product instead of a demo script.

**What you get out of the box**

The same assistant runs on two agent harnesses, switchable from the header:

- **Think** ([`@cloudflare/think`](https://github.com/cloudflare/agents/tree/main/docs/think)), which runs the agentic loop, stores the conversation and resumes interrupted turns
- **Pi** ([`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core)), wrapped in an `AIChatAgent` for the chat protocol and persistence

Each harness keeps its own chat history; long-term memory is shared.

Features:

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

## Make it yours

Cot is meant to be forked and changed. The usual first steps:

1. **Name and brand.** Change the default assistant name in
   `packages/shared/src/settings.ts` (`DEFAULT_SETTINGS`), the page title in
   `apps/web/index.html`, and the theme in `apps/web/src/styles/`. The default
   persona lives in `apps/server/src/agents/common/prompt.ts`.
2. **Domain and Worker name.** Set `name` and `routes` in
   `apps/server/wrangler.jsonc` (this repo uses `runlet.us`), then run
   `npm run types`. Update the Google OAuth redirect URIs to match.
3. **Who can sign in.** `ALLOWED_EMAILS` is the allow-list: just you, your
   family, or your team.
4. **Model.** Workers AI works with no extra key; each user can switch to
   OpenAI, Anthropic or Google with their own key in **Settings → Model**.
   **Usage limits** keep a shared deployment's bill in check. They are `vars`
   in `apps/server/wrangler.jsonc` (`"0"` turns one off):
   - `DAILY_MESSAGE_LIMIT` (default 500) and `MINUTE_MESSAGE_LIMIT`
     (default 20): messages per account, counted across the Think and Pi
     assistants and Telegram; the day resets at 00:00 UTC. Turns on a
     user's own API key don't count.
   - `MAX_REMINDERS` (default 50): scheduled reminders per assistant.

   Each turn makes at most 10 tool-call rounds, and an account's sandbox
   container stops after 15 minutes without a command. Rate limits on the
   public paths (`/auth/*`, `/messengers/*`) and billing alerts are set in
   the Cloudflare dashboard.

5. **Skills.** Add a tool group in `apps/server/src/agents/think/tools/`, or
   connect an existing MCP server from **Settings → MCP servers** without
   writing code. Business-specific knowledge can go into the `cot-knowledge`
   AI Search instance that the knowledge tool searches.
6. **Channels.** Telegram is the reference integration
   (`apps/server/src/integrations/telegram/`); new messengers follow the same
   shape. New clients (browser extension, mobile) go in `apps/`, see
   [docs/architecture.md](docs/architecture.md#adding-a-client).

Before committing, read [AGENTS.md](AGENTS.md): `npm run check` and
`npm run build` must pass, and AI coding agents follow the same rules.

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
bun install               # all workspaces; also installs the pre-commit hook
bunx wrangler login        # or set CLOUDFLARE_API_TOKEN (Workers AI has no local simulator)
bun run dev               # http://localhost:5173
bun run check             # format + lint + typecheck + knip (dead code), as in CI
```

## Deploy

Secrets are read from `apps/server/wrangler.jsonc`, so set them from there:

```bash
cd apps/server
bunx wrangler secret put GOOGLE_CLIENT_ID
bunx wrangler secret put GOOGLE_CLIENT_SECRET
bunx wrangler secret put SESSION_SECRET
bunx wrangler secret put ALLOWED_EMAILS
bunx wrangler secret put CLOUDFLARE_API_KEY
cd ../..
bun run deploy            # → https://runlet.us (also runs on every push to main)
```

## Structure

A Bun-workspaces monorepo. See [AGENTS.md](AGENTS.md) for conventions and
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
