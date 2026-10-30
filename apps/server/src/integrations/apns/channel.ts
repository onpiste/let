import type { PushDevice, PushStatus } from "@cot/shared";

import { apnsConfig } from "./config";
import type { PushDevices } from "./devices";
import { sendPush, type PushAlert } from "./send";

/**
 * Push notifications to the owner's iPhones, so reminders and mail arrive
 * while the app is closed. Without an APNs key it stores tokens and sends
 * nothing; the app then falls back to notices over the socket.
 */
export class PushChannel {
  constructor(private readonly options: { env: Env; devices: PushDevices }) {}

  private get config() {
    return apnsConfig(this.options.env);
  }

  register(device: PushDevice): PushStatus {
    if (!/^[\da-f]{64,200}$/i.test(device.token)) {
      throw new Error("That isn't an APNs device token.");
    }
    if (
      device.environment !== "production" &&
      device.environment !== "sandbox"
    ) {
      throw new Error("Unknown APNs environment.");
    }
    this.options.devices.save(device);
    return { enabled: this.config !== null };
  }

  /** Sends to every registered phone; never throws. */
  async notify(alert: PushAlert) {
    const config = this.config;
    if (!config) return;
    const { devices } = this.options;
    await Promise.all(
      devices.list().map(async (device) => {
        try {
          const result = await sendPush(config, device, alert);
          if (result === "gone") devices.remove(device.token);
        } catch (error) {
          console.error(`APNs push failed: ${String(error)}`);
        }
      })
    );
  }
}
