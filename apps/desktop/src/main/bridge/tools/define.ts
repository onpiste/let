import type {
  CallToolResult,
  McpServer,
  ServerContext,
  ToolCallback
} from "@modelcontextprotocol/server";
import type { z } from "zod";

import type { Policy } from "../policy";

/** One tool call, as shown in the settings window's activity log. */
export type Activity = {
  time: number;
  tool: string;
  summary: string;
  ok: boolean;
};

export type ToolContext = {
  /** The policy in force for this request. */
  policy: Policy;
  log: (entry: Activity) => void;
};

const SUMMARY_MAX = 140;

/** Registers a tool and records each call in the activity log. */
export function defineTool<Schema extends z.ZodObject>(
  server: McpServer,
  ctx: ToolContext,
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (
    args: z.infer<Schema>,
    extra: ServerContext
  ) => Promise<CallToolResult> | CallToolResult
) {
  const logged = async (args: z.infer<Schema>, extra: ServerContext) => {
    const result = await handler(args, extra);
    ctx.log({
      time: Date.now(),
      tool: name,
      summary: JSON.stringify(args).slice(0, SUMMARY_MAX),
      ok: !result.isError
    });
    return result;
  };
  // The SDK's callback type is conditional on the schema and cannot be
  // resolved for a generic one; `logged` has exactly the shape it resolves to.
  server.registerTool(
    name,
    { description, inputSchema },
    logged as unknown as ToolCallback<Schema>
  );
}
