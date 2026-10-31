import type { WebPushSubscription } from "@cot/shared";

import { logInfo } from "../log";
import type { PushAlert } from "../push";
import type { WebPushConfig } from "./config";
import { encryptPayload } from "./encrypt";
import { vapidAuthorization } from "./vapid";

/** "gone" means the subscription is dead and should be forgotten. */
type PushResult = "sent" | "gone" | "failed";

/** Enough of an endpoint to tell browsers apart in the logs. */
export function describeSubscription(subscription: WebPushSubscription) {
  const url = new URL(subscription.endpoint);
  return `${url.host} …${subscription.endpoint.slice(-8)}`;
}

/** Sends one alert to one browser through its push service. */
export async function sendWebPush(
  config: WebPushConfig,
  subscription: WebPushSubscription,
  alert: PushAlert
): Promise<PushResult> {
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidAuthorization(config, subscription.endpoint),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      // Kept a day for a browser that is offline; reminders matter now.
      ttl: "86400",
      urgency: "high"
    },
    body: await encryptPayload(subscription, JSON.stringify(alert))
  });
  const who = describeSubscription(subscription);
  if (response.ok) {
    logInfo(`Web Push sent to ${who}`);
    return "sent";
  }
  console.error(
    `Web Push ${response.status} for ${who}: ${await response.text()}`
  );
  // 404/410: the browser unsubscribed or the subscription expired.
  return response.status === 404 || response.status === 410 ? "gone" : "failed";
}
