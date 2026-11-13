import { AUTH_ROUTES, type DevHealth, DEV_LOG_ROUTES } from "@cot/shared";

import { config, parseFlags } from "../devlog/config";

/**
 * `bun run smoke`: checks a deployment from the outside, without signing
 * in. After a deploy it first waits for /dev/health to report the new sha,
 * so every check below runs against the version just shipped. Exits 1 with
 * one line per failed check; the Deploy workflow then rolls back.
 *
 *   --url https://…   the deployment (default: COT_URL or wrangler's route)
 *   --version <sha>   the git sha that must be live (prefix match)
 *   --wait 90         seconds to wait for that version
 *
 * A new public route or a new way the Worker can fail to boot belongs here.
 */

/** How long one request may take before the check fails. */
const TIMEOUT_MS = 10_000;

type Check = { name: string; run: (base: string) => Promise<string | null> };

/** A check passes with null, or fails with what it saw instead. */
function expectStatus(
  path: string,
  status: number,
  init?: RequestInit,
  also?: (response: Response) => Promise<string | null> | string | null
): Check {
  return {
    name: `${init?.method ?? "GET"} ${path} → ${status}`,
    run: async (base) => {
      const response = await fetch(base + path, {
        redirect: "manual",
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status !== status) return `got ${response.status}`;
      return (await also?.(response)) ?? null;
    }
  };
}

function isHtml(response: Response) {
  const type = response.headers.get("Content-Type") ?? "";
  return type.includes("text/html") ? null : `Content-Type was "${type}"`;
}

const CHECKS: Check[] = [
  // The client: the app shell, and a client-side route served by the SPA
  // fallback.
  expectStatus("/", 200, undefined, isHtml),
  expectStatus("/settings", 200, undefined, isHtml),
  // Auth: the Worker answers, turns strangers away and can start sign-in.
  expectStatus(AUTH_ROUTES.me, 401),
  expectStatus(AUTH_ROUTES.login, 302, undefined, (response) => {
    const to = response.headers.get("Location") ?? "";
    return to.startsWith("https://accounts.google.com/")
      ? null
      : `redirected to "${to}"`;
  }),
  expectStatus(AUTH_ROUTES.logout, 405),
  // The assistant is never reachable without a session.
  expectStatus("/chat", 401),
  // Dev logs: the status is public, ingest is not.
  expectStatus(DEV_LOG_ROUTES.status, 200, undefined, async (response) => {
    // Untrusted JSON from the deployment under test.
    const body = (await response.json()) as { enabled?: unknown };
    return typeof body.enabled === "boolean" ? null : "no `enabled` flag";
  }),
  expectStatus(DEV_LOG_ROUTES.ingest, 401, { method: "POST", body: "{}" })
];

async function health(base: string): Promise<DevHealth | null> {
  try {
    const response = await fetch(base + DEV_LOG_ROUTES.health, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) return null;
    // Untrusted JSON from the deployment under test.
    const body = (await response.json()) as Record<string, unknown>;
    return {
      ok: body.ok === true,
      version: typeof body.version === "string" ? body.version : ""
    };
  } catch {
    return null;
  }
}

/** Git shas come in several lengths; either may be the shorter one. */
function sameVersion(a: string, b: string) {
  return a !== "" && b !== "" && (a.startsWith(b) || b.startsWith(a));
}

/** Null once the deployment is healthy (and on `version`), else why not. */
async function waitForHealth(
  base: string,
  version: string,
  deadline: number
): Promise<string | null> {
  const seen = await health(base);
  if (seen?.ok && (!version || sameVersion(seen.version, version))) {
    return null;
  }
  if (Date.now() >= deadline) {
    if (!seen) return "no answer";
    return `live version is "${seen.version}", expected "${version}"`;
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return waitForHealth(base, version, deadline);
}

export async function smoke(args: string[]) {
  const { flags } = parseFlags(args);
  const base = (flags.url || config.url).replace(/\/$/, "");
  const failures: string[] = [];
  const record = (name: string, failure: string | null) => {
    process.stdout.write(`${failure ? "FAIL" : "ok  "} ${name}\n`);
    if (failure) failures.push(`${name}: ${failure}`);
  };

  process.stdout.write(`Smoke test of ${base}\n`);
  record(
    `GET ${DEV_LOG_ROUTES.health} → healthy`,
    await waitForHealth(
      base,
      flags.version ?? "",
      Date.now() + Number(flags.wait ?? 90) * 1000
    )
  );
  const results = await Promise.all(
    CHECKS.map((check) =>
      check.run(base).catch((error: unknown) => String(error))
    )
  );
  CHECKS.forEach((check, i) => record(check.name, results[i] ?? null));

  if (failures.length > 0) {
    process.stderr.write(
      `\nSmoke test failed (${failures.length}):\n${failures.map((f) => `  ${f}`).join("\n")}\n`
    );
    process.exit(1);
  }
  process.stdout.write("Smoke test passed.\n");
}
