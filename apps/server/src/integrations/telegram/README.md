# Telegram integration

Each user brings their own bot.

1. The user pastes a @BotFather token on the settings page.
   `TelegramChannel.connect` checks it, points the bot's webhook at
   `/messengers/telegram/<routeId>/webhook` with a random secret, and records
   `routeId → account` in the global `TelegramRoutes` Durable Object.
2. `handleTelegramWebhook` maps the route id to the account and hands the
   update to that account's `Assistant`, which runs `gateUpdate`: verify the
   secret, keep to one-to-one chats, let `/start <code>` claim an unclaimed
   bot, and pass on only the owner's messages.
3. Forwarded updates go to Think's messenger runtime, which replies in the
   chat last used in the web or iOS app (each chat is its own `Chat` agent;
   the assistant's conversation resolver picks it).

| File         | What it holds                                                    |
| ------------ | ---------------------------------------------------------------- |
| `config.ts`  | `TelegramConfig` (stored in the user's agent), claim codes       |
| `bot-api.ts` | Bot API calls                                                    |
| `gate.ts`    | Who may reach the assistant through a bot                        |
| `routes.ts`  | `TelegramRoutes` DO and webhook paths                            |
| `webhook.ts` | The Worker's webhook handler                                     |
| `channel.ts` | Bot lifecycle for one assistant: connect, claim, gate, reminders |
