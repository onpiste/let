/**
 * Worker entry point: the HTTP router plus every Durable Object class the
 * Worker binds in wrangler.jsonc. Keep this file to exports only.
 */
import { ThinkMessengerStateAgent } from "@cloudflare/think/messengers";

import { router } from "./http/router";
import { handleIncomingEmail } from "./integrations/email/handler";

export { Assistant } from "./agents/think/assistant";
// One conversation, a facet of Assistant (no binding or migration needed).
export { Chat } from "./agents/think/chat";
export { EmailAddresses } from "./integrations/email/addresses";
export { TelegramRoutes } from "./integrations/telegram/routes";
export { Sandbox } from "./tools/sandbox";
// Backs the Chat SDK state of the Telegram messenger as a sub-agent facet.
export { ThinkMessengerStateAgent };

export default {
  ...router,
  // Mail that Email Routing sends to this Worker (integrations/email).
  email: handleIncomingEmail
} satisfies ExportedHandler<Env>;
