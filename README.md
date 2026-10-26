# Cot — personal AI assistant

An OpenClaw-style personal assistant built on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/), based on the official [`cloudflare/agents-starter`](https://github.com/cloudflare/agents-starter) template.

MVP features:

- **Chat** with streaming replies (Workers AI, no third-party API key)
- **Your own assistant**: each browser gets its own Durable Object, which keeps your chat history across reloads
- **Long-term memory**: the assistant saves facts about you (`remember` / `forget` tools in SQLite) and uses them in later chats
- **Reminders**: "remind me in 10 minutes to…" schedules a task that shows up as an in-app toast and a browser notification
- A calm, minimal chat UI with light and dark mode that works on mobile

## Run locally

```bash
npm install
npx wrangler login        # or set CLOUDFLARE_API_TOKEN (Workers AI has no local simulator)
npm run dev               # http://localhost:5173
```

## Deploy

```bash
npm run deploy            # → https://cot-assistant.<your-subdomain>.workers.dev
```

## Structure

```
src/server.ts   # Assistant agent: system prompt, memory, reminders
src/app.tsx     # Chat UI
src/styles.css  # Theme
```
