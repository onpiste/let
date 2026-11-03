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
    icon: "/favicon.ico",
    // Where a click goes, e.g. /inbox/12 for a new email.
    data: { path: typeof alert.path === "string" ? alert.path : "/" }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  event.waitUntil(openApp(typeof path === "string" ? path : "/"));
});

async function openApp(path) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  const [open] = windows;
  if (!open) return self.clients.openWindow(path);
  // The page routes on the URL (app.tsx); navigate an open tab there.
  if (path !== "/" && "navigate" in open) await open.navigate(path);
  return open.focus();
}
