# Cot — personal AI assistant

An OpenClaw-style personal assistant built on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Think](https://github.com/cloudflare/agents/tree/main/docs/think) (`@cloudflare/think`), which runs the agentic loop, stores the conversation and resumes interrupted turns.

MVP features:

- **Chat** with streaming replies (Workers AI, no third-party API key)
- **Sign in with Google**: each account gets its own Durable Object (chat history, memory, reminders). Only emails in `ALLOWED_EMAILS` can sign in, and the Worker — not the browser — picks which assistant a request reaches
- **Long-term memory**: the assistant saves facts about you (`remember` / `forget` tools in SQLite) and uses them in later chats
- **Reminders**: "remind me in 10 minutes to…" schedules a task that shows up as an in-app toast and a browser notification
- A calm, minimal chat UI with light and dark mode that works on mobile

## Google sign-in setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application** (configure the OAuth consent screen first if asked).
2. Add these **Authorized redirect URIs**:
   - `http://localhost:5173/auth/callback`
   - `https://cot-assistant.<your-subdomain>.workers.dev/auth/callback`
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the client ID and secret, a random `SESSION_SECRET` (`openssl rand -base64 32`) and your email in `ALLOWED_EMAILS`.

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
npm run deploy            # → https://cot-assistant.<your-subdomain>.workers.dev
```

## Structure

```
src/server.ts   # Assistant (a Think agent): model, system prompt, memory and reminder tools
src/auth.ts     # Google sign-in and signed session cookie
src/app.tsx     # Sign-in screen and chat UI
src/styles.css  # Theme
```
