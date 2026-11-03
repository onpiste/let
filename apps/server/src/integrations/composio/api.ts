const BASE_URL = "https://backend.composio.dev/api/v3.1";

/** A Composio tool router session: one MCP endpoint for one user's apps. */
export type ComposioSession = { sessionId: string; mcpUrl: string };

/** One toolkit of a session and the user's account in it, if any. */
export type ToolkitState = {
  slug: string;
  account: { id: string; status: string } | null;
};

export class ComposioError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(`Composio ${status}: ${detail}`);
  }
}

/**
 * The few Composio REST calls Cot makes (v3.1). Plain fetch rather than the
 * SDK, which pulls in Node-only dependencies the Worker doesn't need.
 */
export class ComposioApi {
  constructor(readonly key: string) {}

  /** What the MCP client sends; the session URL alone isn't authorized. */
  get mcpHeaders(): Record<string, string> {
    return { "x-api-key": this.key };
  }

  /**
   * A session limited to `toolkits`, with Composio-managed sign-in. Its
   * workbench (a remote code sandbox) stays off: Cot has its own.
   */
  async createSession(
    userId: string,
    toolkits: string[]
  ): Promise<ComposioSession> {
    const body = await this.request<{
      session_id: string;
      mcp: { url: string };
    }>("POST", "/tool_router/session", {
      user_id: userId,
      toolkits: { enable: toolkits },
      manage_connections: { enable: true },
      workbench: { enable: false }
    });
    return { sessionId: body.session_id, mcpUrl: body.mcp.url };
  }

  async toolkits(sessionId: string, slugs: string[]): Promise<ToolkitState[]> {
    const query = new URLSearchParams({
      toolkits: slugs.join(","),
      limit: String(slugs.length)
    });
    const body = await this.request<{
      items: {
        slug: string;
        connected_account: { id: string; status: string } | null;
      }[];
    }>("GET", `/tool_router/session/${sessionId}/toolkits?${query.toString()}`);
    return body.items.map((item) => ({
      slug: item.slug,
      account: item.connected_account
        ? {
            id: item.connected_account.id,
            status: item.connected_account.status
          }
        : null
    }));
  }

  /** Composio's hosted sign-in page for one toolkit. */
  async link(sessionId: string, toolkit: string): Promise<string> {
    const body = await this.request<{ redirect_url: string }>(
      "POST",
      `/tool_router/session/${sessionId}/link`,
      { toolkit }
    );
    return body.redirect_url;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request("DELETE", `/connected_accounts/${id}`);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "x-api-key": this.key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ComposioError(response.status, text.slice(0, 300));
    }
    // Trust boundary: Composio's documented response shape.
    return (text ? JSON.parse(text) : null) as T;
  }
}
