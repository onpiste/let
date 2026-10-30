/** Closes the MCP OAuth popup; the settings page sees the new state. */
export function mcpPopupResult(result: {
  authSuccess: boolean;
  authError?: string;
}) {
  return new Response(
    result.authSuccess
      ? "<script>window.close()</script>Connected. You can close this window."
      : `Authorization failed: ${result.authError ?? "unknown error"}`,
    {
      status: result.authSuccess ? 200 : 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }
  );
}
