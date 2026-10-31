import type { PushStatus, WebPushSubscription } from "@cot/shared";

import { fromBase64Url } from "../jwt";
import { logInfo } from "../log";
import type { PushAlert } from "../push";
import { webPushConfig } from "./config";
import { describeSubscription, sendWebPush } from "./send";
import type { WebPushSubscriptions } from "./subscriptions";

function isValid({ endpoint, keys }: WebPushSubscription) {
  try {
    return (
      new URL(endpoint).protocol === "https:" &&
      fromBase64Url(keys.p256dh).length === 65 &&
      fromBase64Url(keys.auth).length === 16
    );
  } catch {
    return false;
  }
}

/**
 * Web Push to the owner's browsers, so reminders and mail arrive while the
 * tab is closed: the web app's counterpart of the APNs channel. Without
 * VAPID keys it stores subscriptions and sends nothing.
 */
export class WebPushChannel {
  constructor(
    private readonly options: {
      env: Env;
      subscriptions: WebPushSubscriptions;
    }
  ) {}

  private get config() {
    return webPushConfig(this.options.env);
  }

  publicKey() {
    return this.config?.publicKey ?? null;
  }

  register(subscription: WebPushSubscription): PushStatus {
    if (!isValid(subscription)) {
      throw new Error("That isn't a Web Push subscription.");
    }
    this.options.subscriptions.save(subscription);
    const enabled = this.config !== null;
    logInfo(
      `Web Push browser registered: ${describeSubscription(subscription)}, push ${enabled ? "on" : "off"}`
    );
    return { enabled };
  }

  /** Sends to every subscribed browser; never throws. */
  async notify(alert: PushAlert) {
    const config = this.config;
    if (!config) return;
    const { subscriptions } = this.options;
    const targets = subscriptions.list();
    if (targets.length === 0) {
      logInfo("Web Push skipped: no subscribed browsers");
      return;
    }
    await Promise.all(
      targets.map(async (subscription) => {
        const who = describeSubscription(subscription);
        try {
          const result = await sendWebPush(config, subscription, alert);
          if (result === "gone") {
            subscriptions.remove(subscription.endpoint);
            logInfo(`Web Push browser removed: ${who}`);
          }
        } catch (error) {
          console.error(`Web Push to ${who} failed: ${String(error)}`);
        }
      })
    );
  }
}
