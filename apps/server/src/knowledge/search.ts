import {
  findPersonal,
  personalInstanceId,
  sharedInstanceId
} from "./instances";

const MAX_CHARS = 8000;
const MAX_RESULTS = 8;

/**
 * Passages from the owner's documents and the shared library that answer
 * `query`, each with the file it came from, as JSON for the model.
 */
export async function searchKnowledge(env: Env, owner: string, query: string) {
  const personal = await personalInstanceId(owner);
  const shared = sharedInstanceId(env);
  // No instance until the first upload; searching a missing one fails.
  const ids = [
    ...((await findPersonal(env, owner)) ? [personal] : []),
    ...(shared ? [shared] : [])
  ];
  if (ids.length === 0) {
    return "The knowledge base is empty: the user hasn't uploaded any documents.";
  }
  const response = await env.AI_SEARCH.search({
    query,
    ai_search_options: {
      instance_ids: ids,
      retrieval: { max_num_results: MAX_RESULTS }
    }
  });
  if (response.chunks.length === 0) {
    return "Nothing in the knowledge base matches.";
  }
  const passages = response.chunks.map((chunk) => ({
    source: chunk.item.key,
    library: chunk.instance_id === personal ? "user" : "shared",
    score: Math.round(chunk.score * 100) / 100,
    text: chunk.text
  }));
  return JSON.stringify(passages).slice(0, MAX_CHARS);
}
