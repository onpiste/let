import {
  KNOWLEDGE_ROUTE,
  knowledgeDocPath,
  validateKnowledgeFile,
  type KnowledgeLibrary
} from "@cot/shared";

import { tracedFetch } from "./dev-log";

/** The Worker's JSON, or its `{ error }` as a thrown Error. */
async function request<T>(path: string, init?: RequestInit) {
  const res = await tracedFetch(path, init);
  // Trust boundary: the Worker's JSON response.
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || body === null) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function listKnowledge() {
  return request<KnowledgeLibrary>(KNOWLEDGE_ROUTE);
}

/** Sends one file to the user's knowledge base; it indexes afterwards. */
export async function uploadKnowledge(file: File) {
  const name = validateKnowledgeFile(file.name, file.size);
  await request<{ id: string }>(
    `${KNOWLEDGE_ROUTE}?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    }
  );
}

export function deleteKnowledge(id: string) {
  return request<KnowledgeLibrary>(knowledgeDocPath(id), { method: "DELETE" });
}

export function reindexKnowledge(id: string) {
  return request<KnowledgeLibrary>(knowledgeDocPath(id, true), {
    method: "POST"
  });
}

/** "1.2 MB", "340 KB". */
export function fileSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
