import { getAgentByName } from "agents";

import { AUTH_ROUTES, HARNESSES } from "@cot/shared";

import { handleCallback, handleLogin, handleLogout } from "../auth/google";
import { getUserFromRequest } from "../auth/session";
import { handleTelegramWebhook } from "../integrations/telegram/webhook";
import { jsonResponse } from "./responses";

/**
 * The Worker's HTTP entry point. Static assets are served before this runs;
 * only the paths in `assets.run_worker_first` (wrangler.jsonc) reach it.
 */
export const router = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === AUTH_ROUTES.login) return handleLogin(request, env);
      if (url.pathname === AUTH_ROUTES.callback) {
        return await handleCallback(request, env);
      }
      if (url.pathname === AUTH_ROUTES.logout) {
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }
        return handleLogout(request);
      }
      if (url.pathname.startsWith("/messengers/telegram/")) {
        return await handleTelegramWebhook(request, env);
      }
      if (url.pathname === AUTH_ROUTES.me) {
        const user = await getUserFromRequest(request, env);
        return user
          ? jsonResponse(user)
          : jsonResponse({ error: "Unauthorized" }, { status: 401 });
      }

      // The Worker, not the browser, decides which assistant instance a
      // request reaches. There is deliberately no generic /agents/* route.
      // /chat is the Think assistant, /pi the Pi one; both are keyed by the
      // same account, so they share its memory.
      const harness = url.pathname.split("/")[1];
      if (
        harness === HARNESSES.think.basePath ||
        harness === HARNESSES.pi.basePath
      ) {
        const user = await getUserFromRequest(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const name = `google:${user.id}`;
        if (harness === HARNESSES.pi.basePath) {
          return (await getAgentByName(env.PiAssistant, name)).fetch(request);
        }
        const agent = await getAgentByName(env.Assistant, name);
        if (request.headers.get("Upgrade") === "websocket") {
          await agent.setOwner(user.email, user.name);
        }
        return agent.fetch(request);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      return jsonResponse({ error: message }, { status: 500 });
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
