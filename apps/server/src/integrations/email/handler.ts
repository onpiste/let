import { getAgentByName } from "agents";

import { addresses } from "./addresses";
import { aliasFor } from "./config";

/** Larger emails bounce; the assistant only keeps their text anyway. */
const MAX_RAW_BYTES = 10 * 1024 * 1024;

/**
 * The Worker's `email` handler, for mail Email Routing delivers to
 * `<alias>@EMAIL_DOMAIN`. The Worker maps the alias to an account, so the
 * address alone can never pick an arbitrary assistant instance.
 */
export async function handleIncomingEmail(
  message: ForwardableEmailMessage,
  env: Env
) {
  const alias = env.EMAIL_DOMAIN
    ? aliasFor(message.to, env.EMAIL_DOMAIN)
    : null;
  const userId = alias ? await addresses(env).userFor(alias) : null;
  if (!userId) {
    message.setReject("Unknown recipient");
    return;
  }
  if (message.rawSize > MAX_RAW_BYTES) {
    message.setReject("Message too large");
    return;
  }

  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const assistant = await getAgentByName(env.Assistant, `google:${userId}`);
  const result = await assistant.receiveEmail(message.from, raw);
  if (result === "rejected") {
    message.setReject("This mailbox does not accept mail from you");
  }
}
