/** Which APNs gateway a device token belongs to: Xcode debug builds get sandbox tokens. */
export type PushEnvironment = "production" | "sandbox";

/** A phone that wants pushes, as registered by the iOS app. */
export type PushDevice = { token: string; environment: PushEnvironment };

/** Whether the deployment can send pushes (it has an APNs key). */
export type PushStatus = { enabled: boolean };
