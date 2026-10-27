import { getAgentByName } from "agents";

import { isGoogleService } from "@cot/shared";

import { agentName, getUserFromRequest } from "../../auth/session";
import { SERVICE_SCOPES } from "./grant";
import { redirectToGoogle, type TokenResponse } from "./oauth";

/** Only same-origin paths, so the callback can't be used as an open redirect. */
function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !/^\/[/\\]/.test(value)
    ? value
    : "/";
}

/**
 * GET /auth/google/connect?service=gmail&returnTo=/settings
 *
 * Asks the signed-in user to add one service's scopes to their existing
 * grant. `include_granted_scopes` keeps earlier ones, `login_hint` skips the
 * account picker, and `access_type=offline` + `prompt=consent` make Google
 * return a refresh token the assistant can use while the user is away.
 */
export async function handleGoogleConnect(request: Request, env: Env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  if (!isGoogleService(service)) {
    return new Response("Unknown Google service", { status: 400 });
  }
  return redirectToGoogle(request, env, {
    scope: SERVICE_SCOPES[service].join(" "),
    params: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      login_hint: user.email
    },
    connect: {
      service,
      returnTo: safeReturnTo(url.searchParams.get("returnTo"))
    }
  });
}

/** Called from /auth/callback once Google returns from a service grant. */
export async function finishGoogleConnect(
  request: Request,
  env: Env,
  {
    headers,
    profileId,
    tokens,
    returnTo
  }: {
    headers: Headers;
    profileId: string;
    tokens: TokenResponse;
    returnTo: string;
  }
) {
  const user = await getUserFromRequest(request, env);
  if (!user) return new Response("Unauthorized", { status: 401, headers });
  // The grant belongs to the assistant of the account that is signed in.
  if (profileId !== user.id) {
    return new Response(
      `Pick ${user.email} on Google's screen: that's the account you're signed in with.`,
      { status: 403, headers }
    );
  }
  const agent = await getAgentByName(env.Assistant, agentName(user));
  await agent.saveGoogleGrant(tokens);
  headers.set("Location", safeReturnTo(returnTo));
  return new Response(null, { status: 302, headers });
}
