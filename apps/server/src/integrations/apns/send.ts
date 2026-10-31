import type { PushDevice } from "@cot/shared";

import type { ApnsConfig } from "./config";
import { providerToken } from "./jwt";

/** A notification's visible text. */
export type PushAlert = { title: string; body: string };

/** "gone" means the token is dead and should be forgotten. */
type PushResult = "sent" | "gone" | "failed";

const GATEWAYS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com"
} as const;

/** Sends one alert to one device through APNs. */
export async function sendPush(
  config: ApnsConfig,
  device: PushDevice,
  alert: PushAlert
): Promise<PushResult> {
  const response = await fetch(
    `${GATEWAYS[device.environment]}/3/device/${device.token}`,
    {
      method: "POST",
      headers: {
        authorization: `bearer ${await providerToken(config)}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json"
      },
      body: JSON.stringify({ aps: { alert, sound: "default" } })
    }
  );
  const who = describeDevice(device);
  if (response.ok) {
    logPush(`push sent to ${who}`);
    return "sent";
  }
  const reason = await response.text();
  console.error(`APNs ${response.status} for ${who}: ${reason}`);
  // 410: the app was deleted or signed out. BadDeviceToken: a token from the
  // other environment, which re-registering from the right build replaces.
  if (response.status === 410 || reason.includes("BadDeviceToken")) {
    return "gone";
  }
  return "failed";
}

/** Enough of a token to tell devices apart in the logs. */
export function describeDevice(device: PushDevice) {
  return `…${device.token.slice(-8)} (${device.environment})`;
}

/** A push step that went fine, for `wrangler tail` and Workers Logs. */
export function logPush(message: string) {
  // oxlint-disable-next-line no-console -- a push that never arrives leaves no other trace; these lines show how far it got
  console.log(`APNs ${message}`);
}
