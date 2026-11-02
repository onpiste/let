# Connected apps (Composio)

One-tap sign-in to Gmail, Google Calendar, Drive, Notion, Slack and the
other apps in `CONNECTED_APPS` (`@cot/shared`), without each user adding MCP
servers. Composio holds the OAuth apps and the tokens, so a fork does not
need its own Google verification.

## How it works

1. The settings page calls `connectApp(slug)`. `ConnectedApps` creates the
   user's Composio tool router session (once; `user_id` is the assistant's
   instance name) and returns Composio's hosted sign-in link, which the
   client opens.
2. The session's MCP endpoint is added to the assistant as the MCP server
   `APPS_MCP_ID`, with the deployment's key as a header (kept in the
   assistant's storage, never sent to clients). Chats get its tools like any
   other MCP server's. Clients leave it out of the custom server list.
3. `listApps()` asks Composio which accounts are active and removes the MCP
   server again when none is.

The session is remade when the key or the app list changes, or when
Composio no longer knows it.

## Files

| File      | Job                                                     |
| --------- | ------------------------------------------------------- |
| `api.ts`  | Composio REST v3.1: session, toolkits, link, disconnect |
| `apps.ts` | Per-user state and the MCP server; the callables use it |

## Set up

Create a project at composio.dev and set its API key:

```sh
bunx wrangler secret put COMPOSIO_API_KEY   # from apps/server
```

Without the key the section is hidden and nothing calls Composio. To offer
other apps, edit `CONNECTED_APPS` (toolkit slugs from Composio's catalog)
and its mirror in `apps/mobile/Cot/Settings/AppsSection.swift`.

## Trade-off

Tool calls and the users' tokens go through Composio's cloud, unlike the
rest of Cot. Like other MCP tools, app tools run without an approval step.
