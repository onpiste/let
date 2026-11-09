import { KNOWLEDGE_ROUTE } from "@cot/shared";

import { jsonResponse } from "../http/responses";
import { deleteDoc, listLibrary, reindexDoc } from "./library";
import { handleKnowledgeUpload } from "./upload";

/**
 * `KNOWLEDGE_ROUTE` and the paths under it (see @cot/shared knowledge.ts).
 * The state is all in AI Search, so the Worker answers without waking the
 * assistant. Every call acts on the owner's own instance, so an id from
 * another account finds nothing.
 */
export async function handleKnowledge(
  request: Request,
  env: Env,
  owner: string
) {
  const rest = new URL(request.url).pathname.slice(KNOWLEDGE_ROUTE.length);
  if (rest === "" || rest === "/") {
    if (request.method === "GET") {
      return jsonResponse(await listLibrary(env, owner));
    }
    return handleKnowledgeUpload(request, env, owner);
  }
  const [, rawId, action] = rest.split("/");
  const id = decodeURIComponent(rawId ?? "");
  if (!id) return new Response("Not found", { status: 404 });
  if (request.method === "DELETE" && action === undefined) {
    return jsonResponse(await deleteDoc(env, owner, id));
  }
  if (request.method === "POST" && action === "reindex") {
    return jsonResponse(await reindexDoc(env, owner, id));
  }
  return new Response("Not found", { status: 404 });
}
