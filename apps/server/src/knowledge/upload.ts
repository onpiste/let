import { KNOWLEDGE_LIMITS, validateKnowledgeFile } from "@cot/shared";

import { jsonResponse } from "../http/responses";
import { log } from "../log/logger";
import { ensurePersonal } from "./instances";
import { countDocs } from "./library";

const TOO_BIG = `Files can be up to ${KNOWLEDGE_LIMITS.fileBytes / 1_000_000} MB.`;

/**
 * The body, or null as soon as it passes `limit` bytes: Content-Length can
 * be missing, and buffering an oversized body first would waste memory.
 */
async function readCapped(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Blob();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream reads in order
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      // Leaves the loop right after, so nothing waits on it in turn.
      // oxlint-disable-next-line no-await-in-loop -- runs once, then returns
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new Blob(chunks, {
    type: request.headers.get("Content-Type") ?? ""
  });
}

/**
 * POST `KNOWLEDGE_ROUTE?name=<file name>` with the file as the body.
 * The file goes into the owner's own instance and indexes in the
 * background; the same name again replaces the earlier file.
 */
export async function handleKnowledgeUpload(
  request: Request,
  env: Env,
  owner: string
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > KNOWLEDGE_LIMITS.fileBytes) {
    return jsonResponse({ error: TOO_BIG }, { status: 413 });
  }
  const file = await readCapped(request, KNOWLEDGE_LIMITS.fileBytes);
  if (file === null) return jsonResponse({ error: TOO_BIG }, { status: 413 });
  let name: string;
  try {
    name = validateKnowledgeFile(
      new URL(request.url).searchParams.get("name") ?? "",
      file.size
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, { status: 400 });
  }

  const instance = await ensurePersonal(env, owner);
  if ((await countDocs(instance)) >= KNOWLEDGE_LIMITS.docs) {
    return jsonResponse(
      {
        error: `The knowledge base holds up to ${KNOWLEDGE_LIMITS.docs} documents; delete some first.`
      },
      { status: 409 }
    );
  }
  const item = await instance.items.upload(name, file);
  log.with({ user: owner }).info("knowledge", "Uploaded a document", {
    size: file.size
  });
  return jsonResponse({ id: item.id });
}
