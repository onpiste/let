import { getToolApproval } from "@cloudflare/think/react";
import type { MCPServersState } from "agents";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

const TOOL_LABELS: Record<string, string> = {
  remember: "Saved to memory",
  forget: "Removed from memory",
  scheduleTask: "Reminder set",
  getScheduledTasks: "Checked reminders",
  cancelScheduledTask: "Reminder cancelled",
  runCommand: "Ran command",
  writeSandboxFile: "Wrote file",
  readSandboxFile: "Read file",
  browseWeb: "Opened web page",
  searchKnowledge: "Searched knowledge base",
  runCode: "Ran code",
  codeTask: "Coding agent",
  updateScheduledTask: "Task updated",
  pauseScheduledTask: "Task paused",
  resumeScheduledTask: "Task resumed"
};

/** "server · tool" for MCP tools, keyed by the AI SDK tool name. */
export function mcpToolLabels(state: MCPServersState) {
  const labels: Record<string, string> = {};
  for (const tool of state.tools) {
    const server = state.servers[tool.serverId]?.name ?? "MCP";
    labels[`tool_${tool.serverId.replace(/-/g, "")}_${tool.name}`] =
      `${server} · ${tool.name}`;
  }
  return labels;
}

export function ToolChip({
  part,
  labels,
  onApproval
}: {
  part: UIMessage["parts"][number];
  labels: Record<string, string>;
  onApproval: (id: string, approved: boolean) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const done = part.state === "output-available";
  const input = part.input as Record<string, unknown> | undefined;
  const detail =
    (input?.command as string) ||
    (input?.path as string) ||
    (input?.content as string) ||
    (input?.description as string) ||
    "";
  const approval =
    part.state === "approval-requested" ? getToolApproval(part) : undefined;
  return (
    <div className="tool-chip-group">
      <div className="tool-chip">
        <span className={`dot ${done ? "done" : "pending"}`} />
        <span className="font-medium">
          {TOOL_LABELS[name] ?? labels[name] ?? name}
        </span>
        {detail && <span className="truncate opacity-70">· {detail}</span>}
      </div>
      {approval && (
        <div className="approval-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => onApproval(approval.id, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => onApproval(approval.id, false)}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
