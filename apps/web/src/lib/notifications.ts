import { webPushActive } from "./web-push";

// Browser notifications for reminders. Permission is asked on the first
// message the user sends, so the prompt follows a user gesture.

/** Asks once; `onGranted` runs if the user allows notifications now. */
export function requestNotificationPermission(onGranted: () => void) {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission()
      .then((permission) => {
        if (permission === "granted") onGranted();
      })
      .catch(() => {});
  }
}

export function notify(title: string, body: string) {
  // With Web Push the service worker notifies while the tab is hidden, and
  // the toast covers a visible one.
  if (webPushActive()) return;
  if ("Notification" in window && Notification.permission === "granted") {
    // oxlint-disable-next-line no-new -- constructing it shows it
    new Notification(title, { body });
  }
}
