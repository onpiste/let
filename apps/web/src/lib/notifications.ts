import { Haptics, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";

import { isNativeApp } from "./native";

// Notifications for reminders: system notifications in the iOS app, browser
// notifications on the web. Permission is asked on the first message the
// user sends, so the prompt follows a user gesture.

export function requestNotificationPermission() {
  if (isNativeApp) {
    LocalNotifications.requestPermissions().catch(() => {});
    return;
  }
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notify(title: string, body: string) {
  if (isNativeApp) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    LocalNotifications.schedule({
      // Ids are 32-bit ints; the clock keeps them unique enough here.
      notifications: [{ id: Date.now() % 2_147_483_647, title, body }]
    }).catch(() => {});
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    // oxlint-disable-next-line no-new -- constructing it shows it
    new Notification(title, { body });
  }
}
