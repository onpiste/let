# @cot/bridge

Lets your Cot assistant use **your own computer**: run commands, read and write
files, and start local coding agents (Claude Code, Codex, Pi). It is a small
[MCP](https://modelcontextprotocol.io) server that runs on your machine and is
reached through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
so nothing needs an open port. Runs on macOS, Linux and Windows with Bun.

```
Cot (Worker) ── HTTPS ──► Cloudflare Tunnel ──► cot-bridge (localhost:8787) ──► shell / files / claude / codex / pi
```

Cot already supports per-user remote MCP servers, so the bridge needs no
server, web or iOS change: the tools appear in every chat on every client.

## Set up

1. On the computer: `bun run --filter @cot/bridge init`. It writes
   `~/.cot/bridge.json` (token, allowed folders, agents) and prints the URL.
2. Start it: `bun run --filter @cot/bridge start`.
3. Expose it: `cloudflared tunnel --url http://localhost:8787`. The command
   prints a `https://….trycloudflare.com` address (it changes on every
   restart). For a stable address create a named tunnel
   (`cloudflared tunnel create cot-bridge`, then route a hostname to
   `http://localhost:8787`) and run it as a service.
4. In Cot open **Settings → MCP servers** and add
   `https://<tunnel host>/mcp/<token>`.

Then ask: "show git status in ~/code/cot on my laptop", or "have codex fix the
lint errors in ~/code/app and tell me when it is done".

## Tools

| Tool                                  | What it does                                |
| ------------------------------------- | ------------------------------------------- |
| `run_command`                         | Shell command (PowerShell on Windows, `sh`) |
| `list_dir`, `read_file`, `write_file` | Files inside the allowed folders            |
| `list_agents`, `run_agent`            | Start `claude`, `codex`, `pi` (or your own) |

## Safety

There is no per-command approval in the chat. The guard is the policy on this
computer, which the assistant cannot change:

- The token is part of the URL, so treat the URL like a password. Anyone with
  it can run commands as you. Rotate it by deleting `token` from the config
  (or the file) and running `init` again, then update the URL in Cot.
- `roots` limits file access (symlinks are resolved). `allowShell: false`
  keeps files and agents but removes raw commands. Note that a shell command
  or a coding agent can still touch anything your user can, so the roots are
  a guard rail for file tools, not a sandbox.
- For a stronger lock, put the tunnel hostname behind Cloudflare Access with a
  service token, or run the bridge in a VM or a dedicated account.
- Coding agents run non-interactively; edit `agents` in the config to change
  their flags, for example a stricter permission mode.
