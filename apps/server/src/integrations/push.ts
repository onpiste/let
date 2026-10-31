import type { Agent } from "agents";

import { PushChannel } from "./apns/channel";
import { PushDevices } from "./apns/devices";
import { WebPushChannel } from "./webpush/channel";
import { WebPushSubscriptions } from "./webpush/subscriptions";

/** A notification's visible text. */
export type PushAlert = { title: string; body: string };

/**
 * Every way to reach the owner while no app is open: APNs for the iOS app,
 * Web Push for browsers. Each stores its tokens in the assistant's SQLite.
 */
export class OwnerPush {
  readonly apns: PushChannel;
  readonly web: WebPushChannel;

  constructor(env: Env, db: Pick<Agent<Env>, "sql">) {
    this.apns = new PushChannel({ env, devices: new PushDevices(db) });
    this.web = new WebPushChannel({
      env,
      subscriptions: new WebPushSubscriptions(db)
    });
  }

  /** Sends to every phone and browser; never throws. */
  async notify(alert: PushAlert) {
    await Promise.all([this.apns.notify(alert), this.web.notify(alert)]);
  }
}
