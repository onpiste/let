import { run } from "../proc";

/**
 * Runs an osascript (JXA) or PowerShell script with its arguments passed as a
 * JSON environment variable, so model-provided text is never spliced into
 * code. The script prints JSON.
 */
export async function runScript(
  argv: string[],
  args: unknown
): Promise<unknown> {
  const result = await run(argv, {
    cwd: process.cwd(),
    timeoutMs: 60_000,
    env: { COT_ARGS: JSON.stringify(args) }
  });
  if (result.exitCode !== 0) {
    throw new Error(result.output.trim() || "The script failed.");
  }
  const out = result.output.trim();
  return out === "" ? null : JSON.parse(out);
}

export const osascript = (script: string) => [
  "osascript",
  "-l",
  "JavaScript",
  "-e",
  script
];

export const powershell = (script: string) => [
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  script
];
