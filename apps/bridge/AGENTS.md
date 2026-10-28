# apps/bridge — AGENTS.md

The local device bridge. Root rules in [/AGENTS.md](../../AGENTS.md) apply.
See [README.md](README.md) for what it does and how users run it.

- Runs on a user's computer under **Bun**, on macOS, Linux and Windows. Don't
  use POSIX-only paths or shell syntax; go through `proc.ts` for processes and
  `paths.ts` for file access.
- It does not import `@cot/server` or Cloudflare modules. Cot reaches it only
  over MCP, so no contract in `@cot/shared` is involved.
- Every file tool resolves paths with `resolveInRoots`. Tools return failures
  as text (`failure()`), never throw.
- Policy lives in `~/.cot/bridge.json` on the device; nothing the assistant
  sends may change it.
