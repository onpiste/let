import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the logs live, read from apps/server/wrangler.jsonc so a fork needs
 * no extra settings: the Worker's name and account (for Workers Logs) and
 * its domain (for /dev/logs). Environment variables override each one.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const wrangler = readFileSync(join(root, "apps/server/wrangler.jsonc"), "utf8");

function field(pattern: RegExp) {
  return pattern.exec(wrangler)?.[1] ?? "";
}

export const config = {
  root,
  worker: field(/^\s*"name":\s*"([^"]+)"/m),
  accountId:
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    field(/"CLOUDFLARE_ACCOUNT_ID":\s*"([^"]+)"/),
  /** Reads Workers Logs: a token with Workers Observability access. */
  apiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
  /** The deployment, for build and CI reports. */
  url:
    process.env.COT_URL ||
    `https://${field(/"pattern":\s*"([^"]+)"/) || "localhost:5173"}`,
  /** Same value as the Worker's DEV_LOGS_TOKEN secret. */
  ingestToken: process.env.DEV_LOGS_TOKEN ?? ""
};

/** `--name value` flags; anything else is a positional argument. */
export function parseFlags(args: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = args[i + 1] ?? "";
      i += 1;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

/** "15m", "2h", "1d" or an ISO date → milliseconds since the epoch. */
export function parseSince(value: string | undefined, now = Date.now()) {
  const match = /^(\d+)([smhd])$/.exec(value ?? "1h");
  if (match) {
    const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2] as "s"];
    return now - Number(match[1]) * unit;
  }
  const date = Date.parse(value ?? "");
  if (Number.isNaN(date)) throw new Error(`Bad --since: ${String(value)}`);
  return date;
}
