# Cot — personal AI assistant

An OpenClaw-style personal assistant on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/), based on the official [`cloudflare/agents-starter`](https://github.com/cloudflare/agents-starter) template. The same assistant runs on two agent harnesses, switchable from the header:

- **Think** ([`@cloudflare/think`](https://www.npmjs.com/package/@cloudflare/think)), Cloudflare's own harness
- **Pi** ([`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core)), wrapped in an `AIChatAgent`

Each harness keeps its own history and memory.

MVP features:

- **Chat** with streaming replies (Workers AI, no third-party API key)
- **Your own assistant**: each browser gets its own Durable Object, which keeps your chat history across reloads
- **Long-term memory**: the assistant saves facts about you and uses them in later chats (a Think `memory` context block on Think, `remember` / `forget` tools in SQLite on Pi)
- **Reminders**: "remind me in 10 minutes to…" schedules a task that shows up as an in-app toast and a browser notification
- A calm, minimal chat UI with light and dark mode that works on mobile

## Run locally

```bash
npm install
npx wrangler login        # or set CLOUDFLARE_API_TOKEN (Workers AI has no local simulator)
echo "CLOUDFLARE_API_KEY=<token with Workers AI access>" > .dev.vars   # for the Pi assistant
npm run dev               # http://localhost:5173
```

## Deploy

The Pi assistant calls Workers AI over REST, so set an API token once, and put your account id in `vars.CLOUDFLARE_ACCOUNT_ID` in `wrangler.jsonc`:

```bash
npx wrangler secret put CLOUDFLARE_API_KEY
npm run deploy            # → https://cot-assistant.<your-subdomain>.workers.dev
```

## Structure

```
src/server.ts     # Think assistant + Worker entry
src/pi.ts         # Pi assistant
src/reminders.ts  # Reminder logic shared by both
src/prompt.ts     # Shared persona
src/app.tsx       # Chat UI with the harness switch
src/styles.css    # Theme
```
