import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import type { BridgeConfig } from "./config";
import { registerAgentTools } from "./tools/agents";
import { registerFileTools } from "./tools/files";
import { registerShellTools } from "./tools/shell";

function createServer(config: BridgeConfig) {
  const server = new McpServer(
    { name: "cot-bridge", version: "0.0.0" },
    { capabilities: { logging: {} } }
  );
  registerShellTools(server, config);
  registerFileTools(server, config);
  registerAgentTools(server, config);
  return server;
}

/**
 * The bridge is served at /mcp/<token>: Cot's MCP settings take only a URL, so
 * the secret travels in the path. A bearer header works too, for clients that
 * can send one.
 */
export function startServer(config: BridgeConfig) {
  const handler = createMcpHandler(() => createServer(config));
  const prefix = "/mcp/";
  return Bun.serve({
    port: config.port,
    // Tools can run for many minutes; Bun's default idle limit is 10 s.
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const bearer = request.headers.get("authorization")?.slice(7);
      const authorized =
        url.pathname === prefix + config.token ||
        (url.pathname === "/mcp" && bearer === config.token);
      if (!authorized) return new Response("Not found", { status: 404 });
      return handler.fetch(request);
    }
  });
}
