# APNs push notifications

Reminders and new-mail notices for the iOS app while it is closed. Setup is in
the root README ("iOS push notifications"); without `APNS_KEY` and the
`APNS_*` vars the channel stores tokens and sends nothing.

1. The app calls `registerPushDevice` with its device token and environment
   (sandbox for Xcode debug builds, production otherwise) on every socket
   connection. The assistant keeps the newest ten in `push_devices`.
2. When a reminder fires or mail is triaged, the assistant's `notifyOwner`
   (`agents/think/notices.ts`) broadcasts the event to open clients, messages
   Telegram and calls `OwnerPush.notify` (`../push.ts`), which sends to APNs
   and Web Push.
3. `notify` posts the alert to every token. A token APNs reports as gone (410,
   or `BadDeviceToken`) is deleted; the app registers a fresh one next time.

The app shows its own banner in the foreground; iOS doesn't show pushes there,
so nothing appears twice.

| File         | What it holds                                        |
| ------------ | ---------------------------------------------------- |
| `config.ts`  | Reads the key and ids from the Worker's env          |
| `jwt.ts`     | The ES256 provider token, reused for 50 minutes      |
| `send.ts`    | One HTTP/2 request to the APNs gateway               |
| `devices.ts` | The owner's device tokens, in the assistant's SQLite |
| `channel.ts` | Register a device, push an alert to all of them      |
