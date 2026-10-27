export async function callTelegram(
  env: Env,
  token: string,
  method: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `${env.TELEGRAM_API_BASE_URL || "https://api.telegram.org"}/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const payload = (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
  if (!payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description}`);
  }
  return payload.result;
}

/** Best-effort message; a failure is logged rather than thrown. */
export async function sendText(
  env: Env,
  token: string,
  chatId: number | string,
  text: string
) {
  try {
    await callTelegram(env, token, "sendMessage", { chat_id: chatId, text });
  } catch (error) {
    console.error(error);
  }
}
