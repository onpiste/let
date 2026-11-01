# ADR 0003: One agent per chat

- Status: accepted
- Date: 2026-11-01

## Context

Each account had one `Assistant` Durable Object holding exactly one Think
conversation. Chat history worked by swapping: opening another chat saved
the current messages to SQLite and loaded others in their place. Switching
chats while a reply was streaming broke that reply, and only one chat could
be answering at a time.

## Decision

1. **Each conversation is its own `Chat` agent**, a Think facet (dynamic
   agent) of the user's `Assistant`, with its own SQLite, stream and turn
   recovery. Facets need no wrangler binding or migration, are reachable only
   through the parent (`onBeforeSubAgent` lets in only chats the assistant
   created), and are what the Think multi-chat guide uses.
2. **The user's state stays in the `Assistant`**: settings, memory, skills,
   reminders, the inbox, MCP connections, usage limits and the chat catalog.
   A chat reaches it through `ChatServices`, an `RpcTarget` the assistant
   returns over Durable Object RPC (not a callable, so browsers can't).
3. **Clients open two sockets**: the assistant's for callables and notices,
   and the open chat's at `/chat/sub/chat/<id>`.
4. **Existing data moves once**: the assistant's own conversation and the
   saved snapshots become `Chat` agents with the same ids
   (`chat-migration.ts`).

## Consequences

- Several chats can answer at once, and leaving a chat never stops its reply.
- Every tool call that needs the user's state is one RPC into the assistant.
- Facets share the assistant's machine and alarm; fine for one person's
  chats, not for thousands of busy ones (the SDK suggests top-level objects
  per chat then).
- Memory is shared across chats (it lives in the assistant), unlike Think's
  per-chat context blocks.
