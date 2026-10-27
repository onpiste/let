# Google services

Gmail and Calendar use the Google account the user signed in with. Each is
granted on its own (incremental authorization), so connecting one is a
single consent screen, with no new sign-in and no new OAuth client.

1. The settings page links to `/auth/google/connect?service=gmail`.
   `handleGoogleConnect` sends the user to Google asking only for that
   service's scopes, with `include_granted_scopes` (keep earlier grants),
   `access_type=offline` + `prompt=consent` (get a refresh token) and the
   signed-in email as `login_hint`.
2. Google returns to the same `/auth/callback` as sign-in. The state cookie
   says it was a grant, so `finishGoogleConnect` checks the account matches
   the session and hands the tokens to that user's `Assistant`.
3. `GoogleAccount` stores the grant in the assistant (never in the browser),
   refreshes the access token when needed and reports which services are
   granted. Think's tools for a service exist only once it is granted.

Disconnecting revokes the whole grant: Google can't take back one scope.

| File          | What it holds                                             |
| ------------- | --------------------------------------------------------- |
| `grant.ts`    | Scopes per service, the stored `GoogleGrant`              |
| `oauth.ts`    | Consent redirect + state cookie, token exchange, refresh  |
| `connect.ts`  | `/auth/google/connect` and the grant half of the callback |
| `account.ts`  | One assistant's grant: status, save, revoke, authed fetch |
| `gmail.ts`    | Search, read, draft and send (RFC 2822, threaded replies) |
| `calendar.ts` | List and create events on the primary calendar            |

The tools are in `agents/think/tools/google.ts`; sending email and creating
events need the user's approval, so they are withheld from Telegram turns.

To add a Google service (Drive, Contacts, …): add it to `GOOGLE_SERVICES` in
`@cot/shared`, its scopes to `SERVICE_SCOPES`, an API module here and a tool
group gated on `granted()`.
