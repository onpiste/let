import type { AssistantRpc } from "@cot/shared";

// Web Push: the browser subscribes with the deployment's VAPID key and the
// assistant stores the subscription (registerWebPush), so reminders and mail
// reach this browser while the tab is closed. public/sw.js shows them.

let serverSends = false;

/** Whether the server pushes notices to this browser; until then the page notifies itself. */
export function webPushActive() {
  return serverSends;
}

function fromBase64Url(text: string) {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0);
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/**
 * Subscribes this browser and registers it with the assistant. Sent on every
 * connection, which keeps the server's copy current; does nothing until
 * notifications are allowed, or when the browser or deployment lacks push.
 */
export async function setUpWebPush(rpc: AssistantRpc) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  const publicKey = await rpc.getWebPushKey();
  if (!publicKey) {
    serverSends = false;
    return;
  }
  const key = fromBase64Url(publicKey);
  const registration = await navigator.serviceWorker.register("/sw.js");
  let subscription = await registration.pushManager.getSubscription();
  // A new VAPID key on the server invalidates the old subscription.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key
  });
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  const status = await rpc.registerWebPush({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth }
  });
  serverSends = status.enabled;
}
