# Web Push

Reminders and new-mail notices for browsers while the tab is closed: the web
app's counterpart of [APNs](../apns/README.md). Setup is in the root README
("Web Push"); without `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_SUBJECT` and the
`WEB_PUSH_PRIVATE_KEY` secret the channel stores subscriptions and sends
nothing.

1. Once notifications are allowed, the web app (`apps/web/src/lib/web-push.ts`)
   registers `public/sw.js`, subscribes with the key from `getWebPushKey`, and
   calls `registerWebPush` on every socket connection. The assistant keeps the
   newest ten in `web_push_subscriptions`.
2. When a reminder fires or mail is triaged, `OwnerPush.notify`
   (`../push.ts`) sends the alert here and to APNs.
3. Each alert is encrypted for its browser (RFC 8291) and signed with a VAPID
   token (RFC 8292). A subscription the push service reports as gone (404, 410) is deleted.

The service worker skips the notification while a tab is visible, since the
page shows its own toast then.

| File               | What it holds                                          |
| ------------------ | ------------------------------------------------------ |
| `config.ts`        | Reads the VAPID keys and subject from the Worker's env |
| `vapid.ts`         | The VAPID `Authorization` header, per push service     |
| `encrypt.ts`       | `aes128gcm` payload encryption                         |
| `send.ts`          | One request to a browser's push service                |
| `subscriptions.ts` | The owner's subscriptions, in the assistant's SQLite   |
| `channel.ts`       | Register a browser, push an alert to all of them       |
