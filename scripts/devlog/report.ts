import { execSync, spawn } from "node:child_process";

import { type LogEntry, MAX_LOG_BATCH, redact } from "@cot/shared";

import { config } from "./config";

/**
 * `bun scripts/devlog report <step> -- <command…>`: runs a build or check
 * step with its output passed through, and when it fails sends the failure
 * to the Worker's /dev/logs (source "ci" on GitHub Actions, else "build"),
 * plus one entry per error line it recognises, with file and line. Without
 * DEV_LOGS_TOKEN it only runs the step. Exits with the step's own code.
 */

const TAIL_LINES = 200;
const MAX_FILE_ERRORS = 30;

/** Compiler and linter lines that name a file: tsc, oxlint, Swift, vitest. */
const PATTERNS: { tool: string; re: RegExp }[] = [
  { tool: "tsc", re: /^(\S+?)\((\d+),\d+\): error (TS\d+: .+)$/ },
  { tool: "lint", re: /^(\S+?):(\d+):\d+:\s+error:?\s+(.+)$/ },
  { tool: "vitest", re: /^\s*FAIL\s+(\S+)()\s*(.*)$/ }
];

// oxlint-disable-next-line no-control-regex -- strips ANSI colour codes
const ANSI = /\u001b\[[0-9;]*m/g;

function git(args: string) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function fileErrors(output: string) {
  const found: { tool: string; file: string; line?: number; msg: string }[] =
    [];
  for (const raw of output.split("\n")) {
    const line = raw.replace(ANSI, "");
    for (const { tool, re } of PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      found.push({
        tool,
        file: m[1] ?? "",
        ...(m[2] ? { line: Number(m[2]) } : {}),
        msg: (m[3] ?? "").trim() || line.trim()
      });
      break;
    }
    if (found.length >= MAX_FILE_ERRORS) break;
  }
  return found;
}

function run(command: string[]) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const [cmd = "true", ...args] = command;
    const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk: Buffer, to: NodeJS.WriteStream) => {
      to.write(chunk);
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout.on("data", (c: Buffer) => keep(c, process.stdout));
    child.stderr.on("data", (c: Buffer) => keep(c, process.stderr));
    child.on("error", (error) => resolve({ code: 127, output: String(error) }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function send(entries: LogEntry[]) {
  try {
    const response = await fetch(`${config.url}/dev/logs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.ingestToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ entries: entries.slice(0, MAX_LOG_BATCH) })
    });
    if (!response.ok) {
      process.stderr.write(`devlog: report refused (${response.status})\n`);
    }
  } catch (error) {
    process.stderr.write(`devlog: report not sent: ${String(error)}\n`);
  }
}

export async function report(args: string[]) {
  const split = args.indexOf("--");
  const step = args.slice(0, Math.max(split, 0)).join(" ") || "build";
  const command = split >= 0 ? args.slice(split + 1) : [];
  if (command.length === 0) {
    process.stderr.write("Usage: devlog report <step> -- <command…>\n");
    process.exit(2);
  }

  const { code, output } = await run(command);
  if (code === 0 || !config.ingestToken) process.exit(code);

  const env = process.env;
  const ci = env.GITHUB_ACTIONS === "true";
  const base = {
    ts: new Date().toISOString(),
    level: "error" as const,
    source: ci ? ("ci" as const) : ("build" as const),
    session: ci ? `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` : step,
    version: git("rev-parse --short HEAD")
  };
  const context = {
    step,
    command: command.join(" "),
    exitCode: code,
    branch:
      env.GITHUB_HEAD_REF ||
      env.GITHUB_REF_NAME ||
      git("branch --show-current"),
    ...(ci
      ? {
          workflow: env.GITHUB_WORKFLOW,
          runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        }
      : {})
  };
  const tail = output
    .replace(ANSI, "")
    .split("\n")
    .slice(-TAIL_LINES)
    .join("\n");
  await send([
    {
      ...base,
      scope: step,
      msg: `${step} failed (exit ${code})`,
      data: redact({ ...context, output: tail }) as Record<string, unknown>
    },
    ...fileErrors(output).map(
      (found): LogEntry =>
        Object.assign({}, base, {
          scope: found.tool,
          msg: found.msg,
          data: { file: found.file, line: found.line, step }
        })
    )
  ]);
  process.exit(code);
}
