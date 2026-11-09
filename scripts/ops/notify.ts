/**
 * Sends an alert to ALERT_WEBHOOK_URL when it is set; GitHub's own issue
 * notifications work without it. One payload fits the common chat webhooks:
 * Slack reads `text`, Discord `content`, and Telegram's
 * `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>` reads
 * `text`. A failed alert never fails the run that sent it.
 */
export async function notify(text: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text })
    });
    if (!response.ok) {
      process.stderr.write(`ops: alert refused (${response.status})\n`);
    }
  } catch (error) {
    process.stderr.write(`ops: alert not sent: ${String(error)}\n`);
  }
}

/**
 * Appended to new and reopened issues so a coding agent picks them up, e.g.
 * FIX_AGENT_MENTION="@claude" with the Claude GitHub App installed.
 */
export function agentMention() {
  const mention = process.env.FIX_AGENT_MENTION?.trim();
  return mention
    ? `\n\n${mention} please fix this by following \`.agents/skills/release-loop/SKILL.md\`.`
    : "";
}
