import {
  CONNECTED_APPS,
  isConnectedApp,
  type AppStatus,
  type AppsStatus
} from "@cot/shared";

import { ComposioApi, ComposioError, type ToolkitState } from "./api";

/** The user's Composio session, kept in their assistant's storage. */
export type AppsRecord = {
  sessionId: string;
  mcpUrl: string;
  /** Hash of the key and app list the session was made for. */
  config: string;
};

export type AppsHost = {
  env: Env;
  /** The assistant's instance name, which Composio knows the user by. */
  userId: string;
  getRecord(): AppsRecord | null;
  saveRecord(record: AppsRecord | null): void;
  /** The apps MCP server's URL, or null when it isn't added. */
  mcpUrl(): string | null;
  addMcp(url: string, headers: Record<string, string>): Promise<unknown>;
  removeMcp(): Promise<void>;
};

const STATUS_ACTIVE = "ACTIVE";

/**
 * One-tap apps through Composio. Its session gives each user one MCP
 * endpoint with tools for every app they connected; it is added as an MCP
 * server while at least one app is connected, so chats pick the tools up
 * like any other MCP server's.
 */
export class ConnectedApps {
  constructor(private readonly host: AppsHost) {}

  async status(): Promise<AppsStatus> {
    const api = this.api();
    if (!api) return { available: false, apps: [] };
    // No session until the first connect: viewing settings costs no call.
    if (!this.host.getRecord()) {
      return { available: true, apps: appStatuses([]) };
    }
    const apps = appStatuses(await this.toolkits(api));
    await this.syncMcp(
      api,
      apps.some((app) => app.connected)
    );
    return { available: true, apps };
  }

  async connect(slug: string): Promise<{ url: string }> {
    const api = this.requireApi(slug);
    const record = await this.session(api);
    const url = await api.link(record.sessionId, slug);
    // Add the tools now so a chat right after sign-in has them; status()
    // takes them away again if the sign-in is abandoned.
    await this.syncMcp(api, true);
    return { url };
  }

  async disconnect(slug: string): Promise<AppsStatus> {
    const api = this.requireApi(slug);
    if (this.host.getRecord()) {
      const state = (await this.toolkits(api)).find((t) => t.slug === slug);
      if (state?.account) await api.deleteAccount(state.account.id);
    }
    return this.status();
  }

  private api() {
    const { COMPOSIO_API_KEY: key } = this.host.env as Env & {
      COMPOSIO_API_KEY?: string;
    };
    return key ? new ComposioApi(key) : null;
  }

  private requireApi(slug: string) {
    if (!isConnectedApp(slug)) throw new Error(`Unknown app: ${slug}`);
    const api = this.api();
    if (!api) throw new Error("Connected apps are off for this deployment.");
    return api;
  }

  /** The stored session, or a new one if the key or app list changed. */
  private async session(api: ComposioApi) {
    const config = await fingerprint(api.key);
    const stored = this.host.getRecord();
    if (stored?.config === config) return stored;
    const slugs = CONNECTED_APPS.map((app) => app.slug);
    const session = await api.createSession(this.host.userId, slugs);
    const record = { ...session, config };
    this.host.saveRecord(record);
    return record;
  }

  /** The user's toolkits, making a new session if Composio lost the old one. */
  private async toolkits(api: ComposioApi): Promise<ToolkitState[]> {
    const slugs = CONNECTED_APPS.map((app) => app.slug);
    const record = await this.session(api);
    try {
      return await api.toolkits(record.sessionId, slugs);
    } catch (error) {
      if (!(error instanceof ComposioError && error.status === 404))
        throw error;
      this.host.saveRecord(null);
      return api.toolkits((await this.session(api)).sessionId, slugs);
    }
  }

  private async syncMcp(api: ComposioApi, wanted: boolean) {
    const current = this.host.mcpUrl();
    const url = wanted ? this.host.getRecord()?.mcpUrl : undefined;
    if (current === (url ?? null)) return;
    if (current !== null) await this.host.removeMcp();
    if (url) await this.host.addMcp(url, api.mcpHeaders);
  }
}

function appStatuses(states: ToolkitState[]): AppStatus[] {
  return CONNECTED_APPS.map((app) => {
    const status = states.find((s) => s.slug === app.slug)?.account?.status;
    return {
      ...app,
      connected: status === STATUS_ACTIVE,
      problem: status && status !== STATUS_ACTIVE ? status : null
    };
  });
}

/** Changes when the key or the app list does, so the session follows. */
async function fingerprint(key: string) {
  const text = `${key}\n${CONNECTED_APPS.map((app) => app.slug).join(",")}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
