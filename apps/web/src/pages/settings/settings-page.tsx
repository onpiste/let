import type { MCPServersState } from "agents";
import { useAgent } from "agents/react";
import { useCallback, useState } from "react";

import { ASSISTANT, type User } from "@cot/shared";

import { AssistantSettings } from "./assistant-settings";
import { EmailSettings } from "./email-settings";
import { IntegrationSettings } from "./integration-settings";
import { McpSettings } from "./mcp-settings";

/**
 * Settings for the signed-in user's assistant. Talks to the same Think
 * assistant as the chat, over its WebSocket (callable methods + MCP state).
 */
export function SettingsPage({
  user,
  onBack
}: {
  user: User;
  onBack: () => void;
}) {
  const [mcp, setMcp] = useState<MCPServersState | null>(null);
  const [epoch, setEpoch] = useState(0);
  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    onOpen: useCallback(() => setEpoch((n) => n + 1), []),
    onMcpUpdate: useCallback((state: MCPServersState) => setMcp(state), [])
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <span className="font-semibold tracking-tight">Settings</span>
        </div>
      </header>
      <main className="scroll">
        <div className="column settings">
          <AssistantSettings agent={agent} />
          <McpSettings agent={agent} state={mcp} />
          <IntegrationSettings user={user} agent={agent} epoch={epoch} />
          <EmailSettings agent={agent} epoch={epoch} />
        </div>
      </main>
    </div>
  );
}
