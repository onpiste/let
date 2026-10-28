import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The bridge's local policy. It lives on this computer and nothing the
 * assistant sends can change it: that is what makes it safe to skip
 * per-command approval in the chat.
 */
export type BridgeConfig = {
  /** Secret that is part of the MCP URL; anyone holding it can use the bridge. */
  token: string;
  port: number;
  /** Files are only readable and writable under these folders. */
  roots: string[];
  /** Turn off to allow file access and agents but no raw commands. */
  allowShell: boolean;
  /**
   * Coding agents the assistant may start, by name. `{prompt}` is replaced by
   * the task. Add your own entry to expose another CLI.
   */
  agents: Record<string, string[]>;
};

const CONFIG_DIR = join(homedir(), ".cot");
export const CONFIG_PATH = join(CONFIG_DIR, "bridge.json");

function defaultConfig(): BridgeConfig {
  return {
    token: randomBytes(24).toString("base64url"),
    port: 8787,
    roots: [homedir()],
    allowShell: true,
    agents: {
      claude: ["claude", "-p", "{prompt}", "--permission-mode", "acceptEdits"],
      codex: ["codex", "exec", "{prompt}"],
      pi: ["pi", "-p", "{prompt}"]
    }
  };
}

export async function loadConfig(): Promise<BridgeConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    // Trust boundary: a file the user may have edited by hand.
    const parsed = JSON.parse(raw) as Partial<BridgeConfig>;
    return { ...defaultConfig(), ...parsed };
  } catch {
    return null;
  }
}

/** Writes the default config unless one exists; returns the one in force. */
export async function initConfig(): Promise<BridgeConfig> {
  const existing = await loadConfig();
  if (existing) return existing;
  const config = defaultConfig();
  await mkdir(CONFIG_DIR, { recursive: true });
  // 0600 keeps the token away from other local users (ignored on Windows).
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600
  });
  return config;
}
