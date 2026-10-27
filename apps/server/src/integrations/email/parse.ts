import PostalMime from "postal-mime";

/** Enough of a long email for the model; the rest is dropped. */
const MAX_BODY_CHARS = 20_000;

export type ParsedEmail = {
  /** The From header, as `Name <address>`. */
  from: string;
  fromAddress: string | null;
  subject: string;
  date: string | null;
  messageId: string | null;
  body: string;
  attachments: string[];
};

/** Rough text of an HTML-only email; good enough for a model to read. */
function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseEmail(raw: Uint8Array): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  const from = email.from;
  const fromAddress = from?.address ?? null;
  const body = email.text?.trim() || htmlToText(email.html ?? "");
  return {
    from: from
      ? from.name
        ? `${from.name} <${fromAddress ?? ""}>`
        : (fromAddress ?? from.name)
      : "(unknown sender)",
    fromAddress,
    subject: email.subject?.trim() || "(no subject)",
    date: email.date ?? null,
    messageId: email.messageId ?? null,
    body:
      body.length > MAX_BODY_CHARS
        ? `${body.slice(0, MAX_BODY_CHARS)}\n…(truncated)`
        : body,
    attachments: email.attachments.map(
      (a) => a.filename ?? `(unnamed ${a.mimeType})`
    )
  };
}
