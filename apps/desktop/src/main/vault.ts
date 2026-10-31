import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import type { User } from "@cot/shared";

/** Everything sensitive the app keeps, encrypted as one blob on disk. */
export type VaultData = {
  /** Secret path segment of the MCP URL. */
  mcpSecret: string;
  /** Cot bearer token and when it expires (unix seconds). */
  token?: string;
  tokenExpiresAt?: number;
  user?: User;
  /** Id Cot gave our MCP registration, to replace it later. */
  serverId?: string;
  /** Named-tunnel token, if the owner uses one. */
  tunnelToken?: string;
};

export type VaultCrypto = {
  encrypt: (plain: string) => Buffer;
  decrypt: (data: Buffer) => string;
};

export const newSecret = () => randomBytes(24).toString("base64url");

export class Vault {
  private data: VaultData;

  constructor(
    private readonly path: string,
    private readonly crypto: VaultCrypto
  ) {
    this.data = this.read() ?? { mcpSecret: newSecret() };
    this.write();
  }

  get(): VaultData {
    return this.data;
  }

  /** Merges a patch; a key set to undefined is removed. */
  update(patch: Partial<VaultData>): VaultData {
    const next: Record<string, unknown> = { ...this.data, ...patch };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    // Trust boundary: the keys are VaultData's own.
    this.data = next as VaultData;
    this.write();
    return this.data;
  }

  private read(): VaultData | null {
    try {
      // Trust boundary: our own encrypted file.
      return JSON.parse(
        this.crypto.decrypt(readFileSync(this.path))
      ) as VaultData;
    } catch {
      return null;
    }
  }

  private write() {
    writeFileSync(this.path, this.crypto.encrypt(JSON.stringify(this.data)), {
      mode: 0o600
    });
  }
}
