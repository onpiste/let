/** Which APNs gateway a device token belongs to: Xcode debug builds get sandbox tokens. */
export type PushEnvironment = "production" | "sandbox";

/** A phone that wants pushes, as registered by the iOS app. */
export type PushDevice = { token: string; environment: PushEnvironment };

/** A browser's Web Push subscription (`PushSubscription.toJSON()`). */
export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Whether the deployment can send pushes (it has an APNs or VAPID key). */
export type PushStatus = { enabled: boolean };
