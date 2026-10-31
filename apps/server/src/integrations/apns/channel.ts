import type { PushDevice, PushStatus } from "@cot/shared";

import { apnsConfig } from "./config";
import type { PushDevices } from "./devices";
import { describeDevice, logPush, sendPush, type PushAlert } from "./send";

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
    const enabled = this.config !== null;
    logPush(
      `device registered: ${describeDevice(device)}, push ${enabled ? "on" : "off"}`
    );
    return { enabled };
  }

  /** Sends to every registered phone; never throws. */
  async notify(alert: PushAlert) {
    const config = this.config;
    if (!config) return;
    const { devices } = this.options;
    const targets = devices.list();
    if (targets.length === 0) {
      logPush("push skipped: no registered devices");
      return;
    }
    await Promise.all(
      targets.map(async (device) => {
        try {
          const result = await sendPush(config, device, alert);
          if (result === "gone") {
            devices.remove(device.token);
            logPush(`device removed: ${describeDevice(device)}`);
          }
        } catch (error) {
          console.error(
            `APNs push to ${describeDevice(device)} failed: ${String(error)}`
          );
        }
      })
    );
  }
}
