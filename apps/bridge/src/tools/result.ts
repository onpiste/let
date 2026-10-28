import type { CallToolResult } from "@modelcontextprotocol/server";

export function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

/** Tool failures go back as text so the model can recover. */
export function failure(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: String(error) }]
  };
}
