import { spawn, type ChildProcess } from "node:child_process";

const MAX_OUTPUT = 60_000;

export type RunResult = {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
};

/** Kills a process and its children (a bare kill leaves them running). */
function killTree(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    // The child leads its own process group (detached), so -pid reaches all.
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

/** The platform shell, so one command string works on macOS, Linux and Windows. */
export function shellCommand(command: string): string[] {
  return process.platform === "win32"
    ? ["powershell.exe", "-NoProfile", "-Command", command]
    : ["/bin/sh", "-c", command];
}

/**
 * Windows runs npm-installed CLIs through .cmd shims, which Node refuses to
 * spawn directly. Go through PowerShell with each argument single-quoted.
 */
export function programCommand(path: string, args: string[]): string[] {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(path)) {
    return [path, ...args];
  }
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const line = `& ${[path, ...args].map(quote).join(" ")}`;
  return ["powershell.exe", "-NoProfile", "-Command", line];
}

/** Keeps the tail of the output: the end is where errors and results are. */
class Sink {
  text = "";
  dropped = false;
  add(chunk: string) {
    this.text += chunk;
    if (this.text.length > MAX_OUTPUT) {
      this.text = this.text.slice(-MAX_OUTPUT);
      this.dropped = true;
    }
  }
}

/** Runs a command to completion, merging stdout and stderr. */
export function run(
  argv: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    env?: Record<string, string>;
    /** Called every few seconds while running, to keep the connection alive. */
    onTick?: () => void;
  }
): Promise<RunResult> {
  const [program, ...args] = argv;
  if (!program) return Promise.reject(new Error("Empty command."));
  return new Promise((resolvePromise) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });
    const sink = new Sink();
    let timedOut = false;
    let failed = "";
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      if (tick) clearInterval(tick);
      options.signal?.removeEventListener("abort", onAbort);
      const note = sink.dropped ? "[earlier output truncated]\n" : "";
      resolvePromise({
        output: note + sink.text + failed,
        exitCode,
        timedOut
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs);
    const tick = options.onTick && setInterval(options.onTick, 15_000);
    const onAbort = () => killTree(child);
    options.signal?.addEventListener("abort", onAbort);
    child.stdout.setEncoding("utf8").on("data", (c: string) => sink.add(c));
    child.stderr.setEncoding("utf8").on("data", (c: string) => sink.add(c));
    child.on("error", (error) => {
      failed = String(error);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

export function formatResult(result: RunResult): string {
  const status = result.timedOut
    ? "timed out and was stopped"
    : `exit code ${result.exitCode}`;
  return `${result.output.trimEnd()}\n[${status}]`.trim();
}
