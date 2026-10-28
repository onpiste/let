import type { FileUIPart, TextUIPart } from "ai";

/** One DO row holds a whole chat message and is capped at 2 MB. */
const MAX_ATTACHMENT_BYTES = 1_000_000;

export type Attachment = {
  name: string;
  size: number;
  part: TextUIPart | FileUIPart;
};

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|log|ini|sql|[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|c|h|cpp|sh)$/i;

function isText(file: File) {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name);
}

async function dataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${file.type};base64,${btoa(binary)}`;
}

/**
 * Text files go into the message as text, which every model can read.
 * Images and PDFs go as file parts, which only some models understand.
 */
export async function readAttachment(file: File): Promise<Attachment> {
  if (isText(file)) {
    const body = await file.text();
    return {
      name: file.name,
      size: body.length,
      part: {
        type: "text",
        text: `<file name="${file.name}">\n${body}\n</file>`
      }
    };
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    throw new Error(
      `${file.name}: only text, image and PDF files are supported.`
    );
  }
  return {
    name: file.name,
    size: file.size,
    part: {
      type: "file",
      mediaType: file.type,
      filename: file.name,
      url: await dataUrl(file)
    }
  };
}

/** Throws if the files together are too large to store in one message. */
export function checkTotalSize(attachments: Attachment[]) {
  const total = attachments.reduce((sum, a) => sum + a.size, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments are limited to 1 MB per message.");
  }
}
