# Knowledge base

Documents a user uploads for the assistant to search: manuals, price lists,
policies, industry references. Built on AI Search's built-in storage, so a
fork needs no bucket, index or extra key.

- **One instance per account.** `instances.ts` names it after the assistant
  (`kb-google-<sub>`, or a hash when that doesn't fit AI Search's 32-char
  ids) and creates it with hybrid (vector + keyword) retrieval on the first
  upload. Only the Worker derives the name, from the session.
- **A shared library on top.** `KNOWLEDGE_SHARED_INSTANCE` (`wrangler.jsonc`,
  default `cot-knowledge`) names an instance the deployer fills from the
  Cloudflare dashboard; every user's searches include it. `""` turns it off.
- **HTTP, not callables** (`routes.ts`, paths in `@cot/shared`
  `knowledge.ts`). The state is all in AI Search, so the Worker lists,
  uploads, deletes and re-indexes without waking the assistant, and files
  don't go over the agent socket.
- **Indexing is asynchronous.** An upload returns at once; the item shows
  `indexing` until AI Search has read it, and clients list again every few
  seconds until nothing is. Files over 4 MB, or types AI Search can't read,
  end up `failed` with its reason.
- **Search** (`search.ts`) queries the user's instance (once it exists) and
  the shared one in one call, and tags each passage with its source file so
  the assistant can cite it. The chat tool is `agents/think/tools/knowledge.ts`.

Limits (file size, documents per account, accepted extensions) are
`KNOWLEDGE_LIMITS` and `KNOWLEDGE_EXTENSIONS` in `@cot/shared`, mirrored in
`apps/mobile/Cot/Core/KnowledgeAPI.swift`.
