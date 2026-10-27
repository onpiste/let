import { getAgentByName } from "agents";

import { addresses } from "./addresses";
import { aliasFor } from "./config";

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

  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const assistant = await getAgentByName(env.Assistant, `google:${userId}`);
  const result = await assistant.receiveEmail(message.from, raw);
  switch (result) {
    case "accepted":
      return;
    case "rejected":
      message.setReject("This mailbox does not accept mail from you");
      return;
    case "rate-limited":
      message.setReject("Too much mail to this mailbox; try again later");
      return;
  }
}
