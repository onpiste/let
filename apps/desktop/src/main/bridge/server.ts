import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { registerCalendarTools } from "./calendar";
import type { PolicyStore } from "./policy";
import { registerAgentTools } from "./tools/agents";
import type { Activity, ToolContext } from "./tools/define";
import { registerFileTools } from "./tools/files";
import { registerOrganizeTools } from "./tools/organize";
import { registerShellTools } from "./tools/shell";
import { registerToolsList } from "./tools/tools-list";

export type BridgeOptions = {
  policy: PolicyStore;
  /** The secret in the URL path; read per request so it can be rotated. */
  secret: () => string;
  onActivity: (entry: Activity) => void;
};

export type Bridge = { port: number; close: () => Promise<void> };

/** A fresh server per request, so a policy change applies to the next call. */
async function buildServer({ policy, onActivity }: BridgeOptions) {
  const server = new McpServer(
    { name: "cot-desktop", version: "0.0.0" },
    { capabilities: { logging: {} } }
  );
  const ctx: ToolContext = { policy: policy.get(), log: onActivity };
  registerShellTools(server, ctx);
  registerFileTools(server, ctx);
  registerOrganizeTools(server, ctx);
  registerAgentTools(server, ctx);
  registerToolsList(server, ctx);
  await registerCalendarTools(server, ctx);
  return server;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Serves the tools over MCP on a loopback port, at /mcp/<secret>. Cot's MCP
 * settings take only a URL, so the secret travels in the path.
 */
export function startBridge(options: BridgeOptions): Promise<Bridge> {
  const handler = createMcpHandler(() => buildServer(options));
  const serve = toNodeHandler(handler);
  const http = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    const given = path.startsWith("/mcp/") ? path.slice(5) : "";
    if (!sameSecret(given, options.secret())) {
      res.writeHead(404).end("Not found");
      return;
    }
    void serve(req, res);
  });
  // Tools can run for many minutes; don't cut the connection.
  http.requestTimeout = 0;
  http.timeout = 0;
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => {
      const address = http.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The bridge could not bind a port."));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            http.closeAllConnections();
            http.close(() => done());
          })
      });
    });
  });
}
