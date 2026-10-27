/** The AI Search instance (in the default namespace) holding the knowledge base. */
const KNOWLEDGE_INSTANCE = "cot-knowledge";

const MAX_CHARS = 8000;

/** Passages from the user's uploaded documents relevant to `query`, as JSON. */
export async function searchKnowledge(env: Env, query: string) {
  const instance = env.AI_SEARCH.get(KNOWLEDGE_INSTANCE);
  const results = await instance.search({
    messages: [{ role: "user", content: query }]
  });
  return JSON.stringify(results).slice(0, MAX_CHARS);
}
