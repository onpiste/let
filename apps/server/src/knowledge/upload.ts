import { KNOWLEDGE_LIMITS, validateKnowledgeFile } from "@cot/shared";

import { jsonResponse } from "../http/responses";
import { log } from "../log/logger";
import { ensurePersonal } from "./instances";
import { countDocs } from "./library";

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
    return jsonResponse(
      {
        error: `Files can be up to ${KNOWLEDGE_LIMITS.fileBytes / 1_000_000} MB.`
      },
      { status: 413 }
    );
  }
  const file = await request.blob();
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
