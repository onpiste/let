/**
 * Apps a user connects in one tap (Gmail, Calendar, Notion, …) instead of
 * adding MCP servers one by one. Sign-in and the tools are Composio's; the
 * deployment turns the feature on with its COMPOSIO_API_KEY secret.
 */
export type AppInfo = {
  /** Composio toolkit slug. */
  slug: string;
  name: string;
};

/** Forks: edit this list to offer the apps your users need. */
export const CONNECTED_APPS: AppInfo[] = [
  { slug: "gmail", name: "Gmail" },
  { slug: "googlecalendar", name: "Google Calendar" },
  { slug: "googledrive", name: "Google Drive" },
  { slug: "googledocs", name: "Google Docs" },
  { slug: "googlesheets", name: "Google Sheets" },
  { slug: "notion", name: "Notion" },
  { slug: "slack", name: "Slack" },
  { slug: "github", name: "GitHub" },
  { slug: "linear", name: "Linear" }
];

/**
 * The id of the MCP server that carries the connected apps' tools. Clients
 * leave it out of the custom MCP server list: it is managed for them.
 */
export const APPS_MCP_ID = "apps";

export type AppStatus = AppInfo & {
  connected: boolean;
  /** Composio's account status when not plainly active, e.g. EXPIRED. */
  problem: string | null;
};

export type AppsStatus = {
  /** False when the deployment has no Composio key; the section is hidden. */
  available: boolean;
  apps: AppStatus[];
};

export function isConnectedApp(slug: string): boolean {
  return CONNECTED_APPS.some((app) => app.slug === slug);
}
