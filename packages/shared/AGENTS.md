# packages/shared — AGENTS.md

The contract between the server and every client. Root rules in
[/AGENTS.md](../../AGENTS.md) apply.

```
src/
  routes.ts     HTTP paths and agent harnesses (AUTH_ROUTES, HARNESSES, MCP_CALLBACK_PATH)
  rpc.ts        AssistantRpc (callable signatures), AddMcpResult, ServerEvent
  settings.ts   Settings types, providers, defaults, validation
  telegram.ts   TelegramStatus
  user.ts       User
  index.ts      Re-exports everything
```

## Rules

- **Pure TypeScript only.** No runtime-specific imports (`cloudflare:*`,
  `agents`, `@cloudflare/*`, React, `node:*`, DOM globals). It must run
  unchanged in a Worker, a browser, a browser extension and a test runner.
  Lint enforces the import part; review the rest.
- No secrets and no server-only logic. Anything here ships to the browser.
- Prefer plain data (JSON-serializable types, `as const` objects). Non-JS
  clients (iOS) mirror these shapes by hand or by codegen, so keep them
  simple and documented.
- Breaking a type here is a breaking API change for every client. Add
  fields as optional first; remove them only once no client reads them.
- Consumed as TypeScript source (`exports: "./src/index.ts"`), no build step.
