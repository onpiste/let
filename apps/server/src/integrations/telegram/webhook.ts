import { getAgentByName } from "agents";

import { log } from "../../log/logger";
import { ROUTE_PATTERN, routes, THINK_WEBHOOK_PATH } from "./routes";

/** Telegram retries non-2xx responses, so dropped updates still get 200. */
const ok = () => new Response("ok");

export async function handleTelegramWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  const routeId = ROUTE_PATTERN.exec(url.pathname)?.[1];
  if (!routeId) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const userId = await routes(env).userFor(routeId);
  if (!userId) return new Response("Not found", { status: 404 });

  const assistant = await getAgentByName(env.Assistant, `google:${userId}`);
  const body = await request.text();
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  const result = await assistant.receiveTelegramUpdate(secret, body);
  if (result === "unauthorized") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (result === "handled") return ok();

  // Hand the update to Think's messenger runtime on its own route.
  const response = await assistant.fetch(
    new Request(`${url.origin}${THINK_WEBHOOK_PATH}`, {
      method: "POST",
      headers: request.headers,
      body
    })
  );
  // Think logs the cause only as plain console lines; flag it in ours.
  if (!response.ok) {
    log.warn("telegram", "Messenger runtime rejected an update", {
      status: response.status
    });
  }
  return response;
}
