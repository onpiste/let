import type { Agent } from "agents";

import { APPS_MCP_ID, MCP_CALLBACK_PATH } from "@cot/shared";

import { ConnectedApps } from "../../integrations/composio/apps";
import { mcpPopupResult } from "./mcp-popup";
import type { AssistantStore } from "./store";

type McpHost = Pick<
  Agent<Env>,
  "name" | "mcp" | "addMcpServer" | "removeMcpServer" | "getMcpServers"
>;

/**
 * Where the assistant's tools from outside come from: MCP servers the user
 * adds by URL, and one-tap apps (Composio), which are an MCP server too.
 * Think adds every server's tools to each turn.
 */
export class Connectors {
  constructor(
    private readonly agent: McpHost,
    private readonly env: Env,
    private readonly store: AssistantStore
  ) {}

  /**
   * MCP OAuth opens in a popup; close it and let the settings page pick up
   * the new connection state from the MCP broadcast.
   */
  configureOAuth() {
    this.agent.mcp.configureOAuthCallback({ customHandler: mcpPopupResult });
  }

  addMcp(name: string, url: string) {
    if (!name.trim()) throw new Error("Give the server a name.");
    if (!/^https?:\/\//.test(url)) throw new Error("Enter an http(s) URL.");
    return this.agent.addMcpServer(name.trim(), url.trim(), {
      callbackPath: MCP_CALLBACK_PATH
    });
  }

  removeMcp(id: string) {
    return this.agent.removeMcpServer(id);
  }

  get apps() {
    const { agent, store } = this;
    return new ConnectedApps({
      env: this.env,
      userId: agent.name,
      getRecord: () => store.getAppsRecord(),
      saveRecord: (record) => store.saveAppsRecord(record),
      mcpUrl: () =>
        agent.getMcpServers().servers[APPS_MCP_ID]?.server_url ?? null,
      addMcp: (url, headers) =>
        agent.addMcpServer("Connected apps", url, {
          id: APPS_MCP_ID,
          transport: { type: "streamable-http", headers }
        }),
      removeMcp: () => agent.removeMcpServer(APPS_MCP_ID)
    });
  }
}
