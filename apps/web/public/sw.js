// Service worker for Web Push (apps/server/src/integrations/webpush). Plain
// JavaScript: the browser loads it as is from /sw.js, outside the Vite build.

self.addEventListener("push", (event) => {
  event.waitUntil(show(event.data ? event.data.json() : {}));
});

async function show(alert) {
  // A visible tab already shows the toast, so don't notify twice.
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  if (windows.some((client) => client.visibilityState === "visible")) return;
  await self.registration.showNotification(alert.title || "Cot", {
    body: alert.body || "",
    icon: "/favicon.ico"
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openApp());
});

async function openApp() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  const [open] = windows;
  if (open) return open.focus();
  return self.clients.openWindow("/");
}
