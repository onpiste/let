import { spawn, type ChildProcess } from "node:child_process";

export type TunnelState =
  | { status: "off" }
  | { status: "starting" }
  | { status: "up"; url: string }
  | { status: "error"; error: string };

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/** The public address cloudflared prints for a quick tunnel, if this line has it. */
function parseTunnelUrl(line: string): string | null {
  return QUICK_URL.exec(line)?.[0] ?? null;
}

export type TunnelOptions = {
  /** Port of the local bridge. */
  port: number;
  /** Named-tunnel token; without it a free quick tunnel is used. */
  token?: string;
  /** Public hostname routed to the named tunnel. */
  host?: string;
};

/**
 * Keeps one cloudflared process running and reports its public URL. A quick
 * tunnel gets a new address every start; the owner re-registers it with Cot.
 */
export class Tunnel {
  private child: ChildProcess | null = null;
  private stopped = true;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  constructor(
    private readonly onState: (state: TunnelState) => void,
    private readonly binary: () => Promise<string>
  ) {}

  start(options: TunnelOptions) {
    this.stop();
    this.stopped = false;
    void this.launch(options);
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.child?.kill();
    this.child = null;
    this.onState({ status: "off" });
  }

  private async launch(options: TunnelOptions) {
    this.onState({ status: "starting" });
    let path: string;
    try {
      path = await this.binary();
    } catch (error) {
      this.fail(options, String(error));
      return;
    }
    if (this.stopped) return;
    const target = `http://127.0.0.1:${options.port}`;
    const args = options.token
      ? [
          "tunnel",
          "--no-autoupdate",
          "run",
          "--token",
          options.token,
          "--url",
          target
        ]
      : ["tunnel", "--no-autoupdate", "--url", target];
    const child = spawn(path, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    this.child = child;
    let up = false;
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      const url = options.token
        ? options.host
          ? `https://${options.host}`
          : null
        : parseTunnelUrl(chunk);
      // A named tunnel reports readiness with this line instead of a URL.
      const ready = options.token
        ? /Registered tunnel connection/.test(chunk)
        : url !== null;
      if (!up && ready && url) {
        up = true;
        this.failures = 0;
        this.onState({ status: "up", url });
      }
    });
    child.on("error", (error) => this.fail(options, String(error)));
    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      if (!this.stopped)
        this.fail(options, `cloudflared stopped (exit ${code}).`);
    });
  }

  private fail(options: TunnelOptions, error: string) {
    if (this.stopped) return;
    this.onState({ status: "error", error });
    this.failures += 1;
    const delay = Math.min(2 ** this.failures, 60) * 1000;
    this.retry = setTimeout(() => void this.launch(options), delay);
  }
}
