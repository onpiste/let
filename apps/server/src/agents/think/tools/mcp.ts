import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai";

/** JSON, which is what MCP schemas and results are and what RPC carries. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** One tool of a connected MCP server, as the assistant lists it. */
export type McpToolInfo = {
  serverId: string;
  name: string;
  description: string | null;
  inputSchema: Json;
};

export type McpCaller = {
  callMcp(
    serverId: string,
    name: string,
    args: Record<string, Json>
  ): Promise<Json>;
};

/**
 * The user's MCP tools for a chat. The connections and OAuth tokens stay in
 * the assistant, which every chat shares; a call goes back to it over RPC.
 * Keys match the SDK's own (`tool_<serverId>_<name>`), which the clients'
 * tool chips label from the MCP state.
 */
export function mcpTools(caller: McpCaller, tools: McpToolInfo[]): ToolSet {
  return Object.fromEntries(
    tools.map((info) => [
      `tool_${info.serverId.replace(/-/g, "")}_${info.name}`,
      tool({
        description: info.description ?? undefined,
        // Trust boundary: the schema the MCP server published.
        inputSchema: jsonSchema<Record<string, Json>>(
          info.inputSchema as JSONSchema7
        ),
        execute: async (args) => caller.callMcp(info.serverId, info.name, args)
      })
    ])
  );
}
