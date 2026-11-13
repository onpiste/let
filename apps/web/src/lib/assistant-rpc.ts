import type { useAgent } from "agents/react";

import type { AssistantRpc, ChatRpc } from "@cot/shared";

export type AgentHandle = ReturnType<typeof useAgent<unknown>>;

// The agent's WebSocket stub is untyped; the shared AssistantRpc contract,
// which the server's Assistant implements, gives it its signatures.
export function api(agent: AgentHandle): AssistantRpc {
  return agent.stub as unknown as AssistantRpc;
}

/** The same for a chat's own socket (`chatSocketPath`). */
export function chatApi(agent: AgentHandle): ChatRpc {
  return agent.stub as unknown as ChatRpc;
}
