import {
  KNOWLEDGE_LIMITS,
  knowledgeStatus,
  type KnowledgeDoc,
  type KnowledgeLibrary
} from "@cot/shared";

import { findPersonal, sharedInstanceId } from "./instances";

const PAGE = 100;

function toDoc(item: AiSearchItemInfo): KnowledgeDoc {
  const status = knowledgeStatus(item.status);
  return {
    id: item.id,
    name: item.key,
    size: item.file_size ?? null,
    status,
    ...(status === "failed"
      ? { error: item.error ?? "AI Search couldn't read this file." }
      : {}),
    ...(item.created_at ? { createdAt: item.created_at } : {})
  };
}

/** Every item in an instance, up to the per-account limit. */
async function listItems(instance: AiSearchInstance) {
  const items: AiSearchItemInfo[] = [];
  for (let page = 1; items.length < KNOWLEDGE_LIMITS.docs; page++) {
    // oxlint-disable-next-line no-await-in-loop -- each page decides the next
    const { result } = await instance.items.list({ page, per_page: PAGE });
    items.push(...result);
    if (result.length < PAGE) break;
  }
  return items;
}

async function sharedCount(env: Env) {
  const id = sharedInstanceId(env);
  if (!id) return 0;
  try {
    return (await env.AI_SEARCH.get(id).stats()).completed ?? 0;
  } catch {
    // Not created yet, or another namespace: there's nothing to search.
    return 0;
  }
}

/** The owner's documents, newest first, and the shared library's size. */
export async function listLibrary(
  env: Env,
  owner: string
): Promise<KnowledgeLibrary> {
  const [instance, shared] = await Promise.all([
    findPersonal(env, owner),
    sharedCount(env)
  ]);
  const docs = instance ? (await listItems(instance)).map(toDoc) : [];
  docs.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return { docs, shared };
}

/** How many documents the owner has, for the upload limit. */
export async function countDocs(instance: AiSearchInstance) {
  const { result, result_info } = await instance.items.list({ per_page: 1 });
  return result_info?.total_count ?? result.length;
}

export async function deleteDoc(env: Env, owner: string, id: string) {
  const instance = await findPersonal(env, owner);
  if (instance) await instance.items.delete(id);
  return listLibrary(env, owner);
}

export async function reindexDoc(env: Env, owner: string, id: string) {
  const instance = await findPersonal(env, owner);
  if (instance) await instance.items.get(id).sync();
  return listLibrary(env, owner);
}
