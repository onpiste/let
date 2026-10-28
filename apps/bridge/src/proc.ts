const MAX_OUTPUT = 60_000;

export type RunResult = {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
};

/** Kills a process and its children (a bare kill leaves them on Windows). */
function killTree(proc: Bun.Subprocess) {
  if (process.platform === "win32") {
    Bun.spawn(["taskkill", "/pid", String(proc.pid), "/t", "/f"], {
      stdout: "ignore",
      stderr: "ignore"
    });
  } else {
    proc.kill();
  }
}

/** The platform shell, so one command string works on macOS, Linux and Windows. */
export function shellCommand(command: string): string[] {
  return process.platform === "win32"
    ? ["powershell.exe", "-NoProfile", "-Command", command]
    : ["/bin/sh", "-c", command];
}

async function drain(stream: ReadableStream<Uint8Array>, sink: Sink) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) sink.add(decoder.decode(chunk));
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
export async function run(
  argv: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    /** Called every few seconds while running, to keep the connection alive. */
    onTick?: () => void;
  }
): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });
  const sink = new Sink();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(proc);
  }, options.timeoutMs);
  const tick = options.onTick && setInterval(options.onTick, 15_000);
  const onAbort = () => killTree(proc);
  options.signal?.addEventListener("abort", onAbort);
  try {
    await Promise.all([drain(proc.stdout, sink), drain(proc.stderr, sink)]);
    const exitCode = await proc.exited;
    const note = sink.dropped ? "[earlier output truncated]\n" : "";
    return { output: note + sink.text, exitCode, timedOut };
  } finally {
    clearTimeout(timer);
    if (tick) clearInterval(tick);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export function formatResult(result: RunResult): string {
  const status = result.timedOut
    ? "timed out and was stopped"
    : `exit code ${result.exitCode}`;
  return `${result.output.trimEnd()}\n[${status}]`.trim();
}
