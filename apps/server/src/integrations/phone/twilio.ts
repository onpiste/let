import { TwilioAdapter } from "@cloudflare/voice-twilio";

import { phoneConfig } from "./config";
import {
  streamToken,
  validStreamToken,
  validTwilioSignature
} from "./twilio-auth";

/** The number's "A call comes in" webhook (HTTP POST) points here. */
const PHONE_ANSWER_PATH = "/messengers/phone/answer";
/** `/messengers/phone/stream/<CallSid>/<token>`: the call's media stream. */
const STREAM_PATTERN =
  /^\/messengers\/phone\/stream\/(CA[0-9a-f]{32})\/([\w-]+)$/;

function twiml(body: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      headers: { "Content-Type": "text/xml" }
    }
  );
}

/**
 * Answers a call: checks Twilio's signature, notes who is calling, then
 * tells Twilio to stream the call's audio to a URL only this call can use.
 */
async function answer(request: Request, env: Env) {
  const config = phoneConfig(env);
  if (!config) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const params = new URLSearchParams(await request.text());
  const signature = request.headers.get("X-Twilio-Signature") ?? "";
  if (
    !(await validTwilioSignature(
      config.authToken,
      request.url,
      params,
      signature
    ))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const callSid = params.get("CallSid") ?? "";
  if (!/^CA[0-9a-f]{32}$/.test(callSid)) {
    return new Response("Bad request", { status: 400 });
  }
  // Calls forwarded from the owner's phone keep the original caller here.
  await env.VoiceCall.getByName(callSid).setCaller(params.get("From") ?? "");
  const url = new URL(request.url);
  const token = await streamToken(config.authToken, callSid);
  const streamUrl = `wss://${url.host}/messengers/phone/stream/${callSid}/${token}`;
  return twiml(`<Connect><Stream url="${streamUrl}"/></Connect>`);
}

/** The call's media stream, bridged to its VoiceCall agent by the SDK. */
async function stream(request: Request, env: Env, path: string) {
  const config = phoneConfig(env);
  const match = STREAM_PATTERN.exec(path);
  const [, callSid, token] = match ?? [];
  if (!config || !callSid || !token) {
    return new Response("Not found", { status: 404 });
  }
  if (!(await validStreamToken(config.authToken, callSid, token))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return TwilioAdapter.handleRequest(
    request,
    // The adapter looks the agent's namespace up by name in env.
    env as unknown as Record<string, unknown>,
    "VoiceCall",
    { instanceName: callSid }
  );
}

export async function handlePhone(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  if (path === PHONE_ANSWER_PATH) return answer(request, env);
  return stream(request, env, path);
}
