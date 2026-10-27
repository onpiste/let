// Browser notifications for reminders. Permission is asked on the first
// message the user sends, so the prompt follows a user gesture.

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notify(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    // oxlint-disable-next-line no-new -- constructing it shows it
    new Notification(title, { body });
  }
}
