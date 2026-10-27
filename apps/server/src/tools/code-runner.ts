/** Output longer than this is cut so one run can't flood the context. */
const MAX_OUTPUT = 8000;

/** CPU time one run may use before the isolate throws. */
const CPU_LIMIT_MS = 5_000;

/** Wall-clock time the assistant waits for one run. */
const WALL_LIMIT_MS = 30_000;

export type CodeLanguage = "javascript" | "python";

export interface CodeRunResult {
  logs: string;
  result?: string;
  error?: string;
}

/**
 * The user's code becomes the body of an async function, so it can use
 * `await` and `return` a value. console output is collected and returned.
 */
function javascriptWorker(code: string) {
  return `
const lines = [];
const show = (value) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
for (const level of ["log", "info", "warn", "error", "debug"]) {
  console[level] = (...args) => lines.push(args.map(show).join(" "));
}
const run = async () => {
${code}
};
export default {
  async fetch() {
    try {
      const value = await run();
      return Response.json({
        logs: lines.join("\\n"),
        result: value === undefined ? undefined : show(value)
      });
    } catch (error) {
      return Response.json({
        logs: lines.join("\\n"),
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      });
    }
  }
};
`;
}

/** The code runs with exec(), with stdout and stderr captured. */
function pythonWorker(code: string) {
  // A JSON string is also a valid Python string literal.
  return `
import contextlib, io, json, traceback
from workers import Response, WorkerEntrypoint

CODE = ${JSON.stringify(code)}

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        out = io.StringIO()
        error = None
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                exec(compile(CODE, "<code>", "exec"), {"__name__": "__main__"})
        except BaseException:
            error = traceback.format_exc()
        return Response(
            json.dumps({"logs": out.getvalue(), "error": error}),
            headers={"content-type": "application/json"},
        )
`;
}

function clip(text: string | undefined) {
  if (text === undefined || text === null) return undefined;
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n…(truncated, ${text.length} chars total)`
    : text;
}

/**
 * Runs a snippet in a fresh Dynamic Worker: a new V8 isolate with no
 * bindings and no network, created for this one call and then discarded.
 */
export async function runCode(
  env: Env,
  language: CodeLanguage,
  code: string
): Promise<CodeRunResult> {
  const worker = env.LOADER.load(
    language === "python"
      ? {
          compatibilityDate: "2026-06-11",
          compatibilityFlags: ["python_workers"],
          mainModule: "main.py",
          modules: { "main.py": pythonWorker(code) },
          globalOutbound: null,
          limits: { cpuMs: CPU_LIMIT_MS }
        }
      : {
          compatibilityDate: "2026-06-11",
          mainModule: "main.js",
          modules: { "main.js": javascriptWorker(code) },
          globalOutbound: null,
          limits: { cpuMs: CPU_LIMIT_MS }
        }
  );
  // cpuMs stops a busy loop in production; this also bounds time spent
  // waiting (e.g. a never-resolving promise) and covers local dev, which
  // doesn't enforce cpuMs.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    worker.getEntrypoint().fetch("https://code-runner.invalid/"),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${WALL_LIMIT_MS / 1000} s`)),
        WALL_LIMIT_MS
      );
    })
  ]).finally(() => clearTimeout(timer));
  const body = (await response.json()) as CodeRunResult;
  return {
    logs: clip(body.logs) ?? "",
    result: clip(body.result),
    error: clip(body.error ?? undefined)
  };
}
