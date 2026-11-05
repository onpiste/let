/**
 * The knowledge base: documents a user uploads for the assistant to search
 * (manuals, contracts, industry references). Each account has its own AI
 * Search instance; a deployment may add one shared library on top.
 */

/**
 * The knowledge base over HTTP; the Worker picks the signed-in user's
 * instance. GET lists it (`KnowledgeLibrary`); POST with `?name=<file name>`
 * and the file's bytes as the body adds a file, which then indexes in the
 * background: list again while any is `indexing`.
 */
export const KNOWLEDGE_ROUTE = "/chat/knowledge";

/**
 * One document: DELETE removes it, POST to `…/reindex` indexes it again
 * (e.g. after it failed). Both answer with the new `KnowledgeLibrary`.
 */
export function knowledgeDocPath(id: string, reindex = false) {
  return `${KNOWLEDGE_ROUTE}/${encodeURIComponent(id)}${reindex ? "/reindex" : ""}`;
}

export const KNOWLEDGE_LIMITS = {
  /** AI Search doesn't index larger files. */
  fileBytes: 4_000_000,
  /** Documents per account. */
  docs: 200,
  /** Characters in a file name. */
  name: 120
} as const;

/** File types AI Search turns into searchable text. */
export const KNOWLEDGE_EXTENSIONS = [
  "pdf",
  "txt",
  "md",
  "csv",
  "json",
  "yaml",
  "yml",
  "log",
  "html",
  "htm",
  "xml",
  "docx",
  "xlsx",
  "odt",
  "ods",
  "png",
  "jpg",
  "jpeg",
  "webp"
] as const;

/** `indexing` until AI Search has read it; `failed` carries the reason. */
export type KnowledgeStatus = "indexing" | "ready" | "failed";

export type KnowledgeDoc = {
  /** AI Search's item id, for `knowledgeDocPath`. */
  id: string;
  /** The file name; uploading the same name again replaces it. */
  name: string;
  /** Bytes, when AI Search reports it. */
  size: number | null;
  status: KnowledgeStatus;
  error?: string;
  /** ISO time it was added. */
  createdAt?: string;
};

export type KnowledgeLibrary = {
  /** The user's own documents, newest first. */
  docs: KnowledgeDoc[];
  /** Documents in the deployment's shared library, searched as well. */
  shared: number;
};

/** AI Search's item status, as the three states clients show. */
export function knowledgeStatus(status: string): KnowledgeStatus {
  if (status === "completed") return "ready";
  if (status === "error" || status === "skipped") return "failed";
  return "indexing";
}

/**
 * The name to store an upload under: the base name, without path or
 * control characters. Throws a user-readable error if the file can't go in.
 */
export function validateKnowledgeFile(name: string, size: number) {
  const base = name.split(/[/\\]/).pop() ?? "";
  const clean = base.replace(/\p{Cc}/gu, "").trim();
  if (!clean) throw new Error("The file needs a name.");
  if (clean.length > KNOWLEDGE_LIMITS.name) {
    throw new Error(
      `Shorten the file name to ${KNOWLEDGE_LIMITS.name} characters.`
    );
  }
  const ext = clean.includes(".")
    ? (clean.split(".").pop() ?? "").toLowerCase()
    : "";
  if (!(KNOWLEDGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Upload ${KNOWLEDGE_EXTENSIONS.join(", ")} files; .${ext || "?"} isn't supported.`
    );
  }
  if (size <= 0) throw new Error("The file is empty.");
  if (size > KNOWLEDGE_LIMITS.fileBytes) {
    throw new Error(
      `Files can be up to ${KNOWLEDGE_LIMITS.fileBytes / 1_000_000} MB.`
    );
  }
  return clean;
}
