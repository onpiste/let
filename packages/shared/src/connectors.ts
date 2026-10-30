/** A well-known remote MCP server offered as a one-tap connector. */
export type ConnectorPreset = {
  name: string;
  url: string;
};

/** Forks: edit this list to offer the connectors your users need. */
export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  { name: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "Linear", url: "https://mcp.linear.app/mcp" },
  { name: "GitHub", url: "https://api.githubcopilot.com/mcp/" },
  { name: "Sentry", url: "https://mcp.sentry.dev/mcp" },
  { name: "Atlassian", url: "https://mcp.atlassian.com/v1/sse" },
  { name: "Asana", url: "https://mcp.asana.com/sse" },
  { name: "Cloudflare Docs", url: "https://docs.mcp.cloudflare.com/mcp" }
];
