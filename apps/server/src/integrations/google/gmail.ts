import type { GoogleAccount } from "./account";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Keeps a long email from flooding the model's context. */
const MAX_BODY_CHARS = 8000;

type Header = { name: string; value: string };
type Part = {
  mimeType?: string;
  headers?: Header[];
  body?: { data?: string };
  parts?: Part[];
};
type Message = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: Part;
};

function header(part: Part | undefined, name: string) {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

function decodeBase64Url(data: string) {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(text: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The first text/plain part, else text/html with the tags stripped. */
function bodyText(part: Part | undefined): string {
  if (!part) return "";
  const find = (p: Part, type: string): string | null => {
    if (p.mimeType === type && p.body?.data)
      return decodeBase64Url(p.body.data);
    for (const child of p.parts ?? []) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain;
  const html = find(part, "text/html") ?? "";
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summary(message: Message) {
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(message.payload, "From"),
    to: header(message.payload, "To"),
    subject: header(message.payload, "Subject"),
    date: header(message.payload, "Date"),
    unread: message.labelIds?.includes("UNREAD") ?? false,
    snippet: message.snippet
  };
}

/** Messages matching a Gmail search query, newest first, as summaries. */
export async function searchEmail(
  google: GoogleAccount,
  query: string,
  max: number
) {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const list = await google.json<{ messages?: { id: string }[] }>(
    `${API}/messages?${params.toString()}`
  );
  const metadata = new URLSearchParams({ format: "metadata" });
  for (const name of ["From", "To", "Subject", "Date"]) {
    metadata.append("metadataHeaders", name);
  }
  return Promise.all(
    (list.messages ?? []).map(async ({ id }) =>
      summary(
        await google.json<Message>(
          `${API}/messages/${id}?${metadata.toString()}`
        )
      )
    )
  );
}

export async function readEmail(google: GoogleAccount, id: string) {
  const message = await google.json<Message>(
    `${API}/messages/${encodeURIComponent(id)}?format=full`
  );
  const body = bodyText(message.payload);
  return {
    ...summary(message),
    body:
      body.length > MAX_BODY_CHARS
        ? `${body.slice(0, MAX_BODY_CHARS)}\n…(truncated)`
        : body
  };
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  /** Reply in this message's thread, with the right headers. */
  replyToId?: string;
};

/** Non-ASCII subjects need RFC 2047 encoding. */
function encodeSubject(subject: string) {
  return /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`;
}

/** Builds the raw RFC 2822 message (and thread) Gmail expects. */
async function compose(google: GoogleAccount, email: OutgoingEmail) {
  const headers = [`To: ${email.to}`];
  if (email.cc) headers.push(`Cc: ${email.cc}`);
  let subject = email.subject;
  let threadId: string | undefined;
  if (email.replyToId) {
    const original = await google.json<Message>(
      `${API}/messages/${encodeURIComponent(email.replyToId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`
    );
    threadId = original.threadId;
    const messageId = header(original.payload, "Message-ID");
    if (messageId) {
      const references = header(original.payload, "References");
      headers.push(`In-Reply-To: ${messageId}`);
      headers.push(
        `References: ${references ? `${references} ` : ""}${messageId}`
      );
    }
    const originalSubject = header(original.payload, "Subject") ?? "";
    if (!subject) {
      subject = /^re:/i.test(originalSubject)
        ? originalSubject
        : `Re: ${originalSubject}`;
    }
  }
  headers.push(
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit"
  );
  const raw = encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${email.body}`);
  return threadId ? { raw, threadId } : { raw };
}

export async function createDraft(google: GoogleAccount, email: OutgoingEmail) {
  const message = await compose(google, email);
  const draft = await google.json<{ id: string }>(`${API}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  return `Saved draft ${draft.id}. The user can review and send it from Gmail.`;
}

export async function sendEmail(google: GoogleAccount, email: OutgoingEmail) {
  const message = await google.json<{ id: string }>(`${API}/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await compose(google, email))
  });
  return `Sent (message ${message.id}).`;
}
