import type { AddMcpResult } from "@cot/shared";

import { RpcSession } from "./rpc";

const ATTEMPTS = 5;
const RETRY_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Points the owner's Cot account at this computer's tunnel: removes the
 * server registered last time (its URL is dead after a quick-tunnel restart)
 * and adds the new one. A fresh tunnel hostname can take a few seconds to
 * resolve, so adding is retried.
 */
export async function registerBridge(options: {
  origin: string;
  token: string;
  name: string;
  url: string;
  previousId: string | null;
}): Promise<string> {
  const session = await RpcSession.open(options.origin, options.token);
  try {
    if (options.previousId) {
      await session.call("removeMcp", options.previousId).catch(() => {});
    }
    let lastError: unknown = new Error("Could not register.");
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- retries are sequential
        const result = await session.call<AddMcpResult>(
          "addMcp",
          options.name,
          options.url
        );
        if (result.state !== "ready") {
          throw new Error(
            "Cot asked for authorization, which the bridge does not use."
          );
        }
        return result.id;
      } catch (error) {
        lastError = error;
        // oxlint-disable-next-line no-await-in-loop -- wait before the next try
        await sleep(RETRY_MS);
      }
    }
    throw lastError;
  } finally {
    session.close();
  }
}

/** Removes the registration, e.g. on sign-out. Failures are not fatal. */
export async function unregisterBridge(options: {
  origin: string;
  token: string;
  id: string;
}) {
  const session = await RpcSession.open(options.origin, options.token);
  try {
    await session.call("removeMcp", options.id);
  } finally {
    session.close();
  }
}
