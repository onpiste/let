/**
 * When a sandbox tool call must wait for the user's approval. Pure logic, so
 * the server and any client agree on the rules.
 *
 * The sandbox is the real safety boundary (isolated and disposable), so "auto"
 * lets ordinary work through and only stops for calls that are destructive,
 * escalate privileges, fetch-and-run code or touch the outside world.
 */

export type ApprovalMode = "ask" | "auto" | "yolo";

export const APPROVAL_MODES: Record<
  ApprovalMode,
  { label: string; hint: string }
> = {
  ask: {
    label: "Ask every time",
    hint: "Approve each command and file write."
  },
  auto: {
    label: "Auto",
    hint: "Routine sandbox work runs on its own; risky commands still ask."
  },
  yolo: {
    label: "Never ask",
    hint: "Everything runs without approval. Prompt injection from web pages or email could drive commands."
  }
};

/** Tools that can change the sandbox and are gated by the approval mode. */
export type GatedTool = "runCommand" | "writeSandboxFile" | "codeTask";

// Anything matching is treated as risky. Deliberately broad: a false positive
// costs one click, a false negative costs the user's data or keys.
const RISKY_COMMAND: RegExp[] = [
  /\bsudo\b|\bsu\b/,
  /\brm\s+(-\w*[rf]|--recursive|--force)/,
  /\b(mkfs|dd|shutdown|reboot|chmod|chown|kill|pkill)\b/,
  /\b(curl|wget)\b[^\n]*(\||;|&&)\s*(ba|z)?sh\b/,
  /\b(ba|z)?sh\b\s+-c\b|\beval\b|\bsource\b\s+<\(/,
  /\bgit\s+push\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\b/,
  /\b(wrangler|npm\s+publish|bun\s+publish|gh|aws|gcloud)\b/,
  />\s*\/(?!workspace\b|tmp\b)/,
  /(^|[\s"'=])\/(?!workspace\b|tmp\b)[^\s]*/,
  /\.\.\//,
  /\$\(|`/,
  /\b(env|printenv)\b|\.env\b|id_rsa|\.ssh\b|\bsecret|\btoken\b|api[_-]?key/i
];

/** True when the command is clearly routine; unsure counts as risky. */
export function isSafeCommand(command: string): boolean {
  return !RISKY_COMMAND.some((pattern) => pattern.test(command));
}

/** Files are safe inside /workspace (the default) or /tmp, never via "..". */
export function isSafePath(path: string): boolean {
  if (path.includes("..") || path.startsWith("~")) return false;
  return (
    !path.startsWith("/") ||
    path.startsWith("/workspace/") ||
    path.startsWith("/tmp/")
  );
}

export function requiresApproval(
  mode: ApprovalMode,
  tool: GatedTool,
  input: { command?: string; path?: string }
): boolean {
  if (mode === "yolo") return false;
  if (mode === "ask") return true;
  switch (tool) {
    case "runCommand":
      return !isSafeCommand(input.command ?? "");
    case "writeSandboxFile":
      return !isSafePath(input.path ?? "");
    // The coding agent chains its own commands, so it stays a deliberate,
    // up-front decision unless the user chose "yolo".
    case "codeTask":
      return true;
    default: {
      const unreachable: never = tool;
      return unreachable;
    }
  }
}
