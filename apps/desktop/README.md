# Cot Desktop

A small tray app that lets your Cot assistant use **your own computer**: your
calendar and reminders, files, and command-line tools such as ffmpeg,
ImageMagick, `claude`, `codex` and `pi`. Cot runs in the cloud and cannot do
these things itself.

```
Cot (Worker) ── HTTPS ──► Cloudflare Tunnel ──► Cot Desktop (127.0.0.1) ──► calendar / files / CLIs
```

Nothing listens on a public port: the app starts a [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(`cloudflared`, downloaded on first run and checked against its published
SHA-256) and signs in to your Cot account, then registers itself as an MCP
server. The tools then appear in every chat on web, iOS and Telegram.

## Use it

1. Install the app (`bun run --filter @cot/desktop package`, or the artifacts
   of the **Desktop** workflow) and open it.
2. Check the Cot address (your deployment) and **Sign in with Google**.
3. Wait for "Registered in Cot", then ask: "what's on my calendar tomorrow?",
   "sort the photos in ~/Downloads by month", "convert this video to mp4 with
   ffmpeg", "have codex fix the tests in ~/code/app".

To run it from source: `bun run --filter @cot/desktop dev`. Forks set their own
default address with `MAIN_VITE_COT_ORIGIN` at build time. The server needs
`NATIVE_REDIRECT_URI` set (it enables native sign-in; the app uses a
`http://127.0.0.1:<port>/callback` redirect).

## Tools

| Tool                                                    | What it does                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `run_command`                                           | Shell command (PowerShell on Windows, `sh` elsewhere)                    |
| `list_dir`, `read_file`, `write_file`                   | Files inside the allowed folders                                         |
| `find_files`, `move_files`                              | Find by name, size, date; move with a dry-run preview, never overwriting |
| `list_agents`, `run_agent`                              | Start `claude`, `codex`, `pi` (or your own CLI)                          |
| `list_tools`                                            | Which of ffmpeg, ImageMagick, pandoc, … are installed                    |
| `calendar_list`, `calendar_create`, `calendar_delete`   | macOS Calendar, Windows Outlook, an `.ics` file, or khal                 |
| `reminders_list`, `reminders_add`, `reminders_complete` | macOS Reminders                                                          |

Calendar notes: macOS asks once for permission to control Calendar and
Reminders; recurring events are listed once; khal can list and add but not
delete; Outlook needs the classic desktop Outlook.

## Safety

There is no approval prompt per command. The guard is the policy in this
window, which the assistant cannot change:

- **Folders** limit the file tools (symlinks are resolved).
- **Run commands** off removes `run_command`. Commands and coding agents can
  still touch anything your user account can, so folders are a guard rail for
  the file tools, not a sandbox.
- The MCP URL contains a secret: anyone with it can use this computer as you.
  **Rotate secret** replaces it in Cot automatically. For a stronger lock, put
  your own tunnel hostname behind Cloudflare Access, or run on a dedicated
  account.
- The sign-in token and secret are stored encrypted with the OS keychain
  (Electron `safeStorage`). The activity log shows every call.

Coding agents and probes are listed in `policy.json` in the app's data folder
(for example `~/Library/Application Support/Cot Desktop/` on macOS); edit it to
change an agent's flags or add another CLI.

## Limits

- The default quick tunnel changes address on every start; the app re-registers
  automatically while it runs. While it is off, Cot lists the server as
  unreachable. A named tunnel (Stable address card) keeps one address.
- Installers are not code-signed or notarized, so macOS and Windows warn on
  first launch.
- Coding agents start a fresh session per task; there is no resume yet.
