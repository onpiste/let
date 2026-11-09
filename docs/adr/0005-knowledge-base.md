# ADR 0005: Knowledge base on AI Search built-in storage

- Status: accepted
- Date: 2026-11-05

## Context

The `searchKnowledge` tool searched a single AI Search instance,
`cot-knowledge`, that the deployer filled from the dashboard. Users couldn't
add their own documents, and every account searched the same files, which
breaks "per-user by default" once one user's files go in.

## Decision

1. **One AI Search instance per account**, with built-in storage, created
   on the first upload through the `ai_search_namespaces` binding we already
   have. Isolation comes from separate instances, not from metadata filters
   that one missing clause would defeat.
2. **`cot-knowledge` becomes the shared library**, configurable with
   `KNOWLEDGE_SHARED_INSTANCE`. Searches cover the user's instance and the
   shared one in one multi-instance call.
3. **The Worker serves the knowledge base over HTTP** (`/chat/knowledge`),
   not as `Assistant` callables: AI Search holds all the state, so there's
   nothing for the Durable Object to do, and uploads stay off the socket.
4. **AI Search is the source of truth** for names, sizes and indexing
   status; we keep no copy in the Durable Object.

## Alternatives

- **R2 bucket + one AI Search instance filtered by folder.** Another binding
  to set up per fork, and the privacy of every search rests on a filter.
- **R2 + `env.AI.toMarkdown()` + Vectorize, chunked ourselves.** Full
  control over parsing and chunking, at roughly three times the code; worth
  it only if AI Search's conversion or 4 MB limit gets in the way.

## Consequences

- No new binding, secret or dashboard step for a fork; the shared library
  is optional.
- Files are limited to what AI Search reads (4 MB, its file types), and
  indexing is asynchronous, so clients poll while a file is `indexing`.
- Managing the shared library from the app (admins uploading) is left for
  later; today it's filled from the dashboard.
