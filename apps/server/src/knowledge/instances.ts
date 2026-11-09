/**
 * Which AI Search instances an account's knowledge lives in. The owner is
 * the assistant's name (`google:<sub>`); only the Worker derives it, from
 * the session, so a client can never point at someone else's instance.
 */

const ID = /^[a-z0-9_]+(?:-[a-z0-9_]+)*$/;
const MAX_ID = 32;

/** Instances this isolate has already seen or created. */
const known = new Set<string>();

/** `kb-google-<sub>`, or a hash of the owner when that doesn't fit. */
export async function personalInstanceId(owner: string) {
  const readable = `kb-${owner.toLowerCase().replace(/[^a-z0-9_]+/g, "-")}`;
  if (readable.length <= MAX_ID && ID.test(readable)) return readable;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(owner)
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `kb-${hex.slice(0, MAX_ID - 3)}`;
}

/** The deployment's shared library, or null when KNOWLEDGE_SHARED_INSTANCE is "". */
export function sharedInstanceId(env: Env) {
  // Widened: `wrangler types` makes a var a literal type.
  const id: string = env.KNOWLEDGE_SHARED_INSTANCE;
  return id.trim() || null;
}

/** The owner's instance, or null if they have never uploaded anything. */
export async function findPersonal(env: Env, owner: string) {
  const id = await personalInstanceId(owner);
  const instance = env.AI_SEARCH.get(id);
  if (known.has(id)) return instance;
  try {
    await instance.info();
  } catch {
    return null;
  }
  known.add(id);
  return instance;
}

/** The owner's instance, created with built-in storage on first use. */
export async function ensurePersonal(env: Env, owner: string) {
  const found = await findPersonal(env, owner);
  if (found) return found;
  const id = await personalInstanceId(owner);
  // Hybrid retrieval: trade terms and part numbers match by keyword even
  // when embeddings don't place them close.
  const instance = await env.AI_SEARCH.create({
    id,
    index_method: { vector: true, keyword: true }
  });
  known.add(id);
  return instance;
}
