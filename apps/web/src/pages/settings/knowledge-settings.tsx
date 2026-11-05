import { useCallback, useEffect, useRef, useState } from "react";

import {
  KNOWLEDGE_EXTENSIONS,
  KNOWLEDGE_LIMITS,
  type KnowledgeDoc,
  type KnowledgeLibrary
} from "@cot/shared";

import { errorText } from "../../lib/errors";
import {
  deleteKnowledge,
  fileSize,
  listKnowledge,
  reindexKnowledge,
  uploadKnowledge
} from "../../lib/knowledge";

const ACCEPT = KNOWLEDGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
/** How often to re-list while a document is still indexing. */
const POLL_MS = 4000;

function StatusPill({ doc }: { doc: KnowledgeDoc }) {
  if (doc.status === "ready") {
    return <span className="pill ready small">ready</span>;
  }
  if (doc.status === "failed") {
    return (
      <span className="pill failed small" title={doc.error}>
        failed
      </span>
    );
  }
  return <span className="pill small">indexing…</span>;
}

/**
 * The user's knowledge base: documents the assistant searches before
 * answering. Mirrors KnowledgeSection.swift.
 */
export function KnowledgeSettings() {
  const [library, setLibrary] = useState<KnowledgeLibrary | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    () =>
      listKnowledge()
        .then(setLibrary)
        .catch((e: unknown) => setError(errorText(e))),
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-armed by each listing until nothing is indexing any more.
  const indexing = library?.docs.some((d) => d.status === "indexing");
  useEffect(() => {
    if (!indexing) return;
    const timer = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(timer);
  }, [library, indexing, refresh]);

  const upload = async (files: File[]) => {
    setError(null);
    setUploading(files.length);
    const failed: string[] = [];
    // One at a time, so each counts against the limit before the next.
    for (const file of files) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
        await uploadKnowledge(file);
      } catch (e) {
        failed.push(`${file.name}: ${errorText(e)}`);
      }
      setUploading((n) => n - 1);
    }
    if (failed.length) setError(failed.join("\n"));
    await refresh();
  };

  const act = (work: Promise<KnowledgeLibrary>) => {
    setError(null);
    work.then(setLibrary).catch((e: unknown) => setError(errorText(e)));
  };

  const docs = library?.docs ?? [];
  return (
    <section className="card">
      <h2>Knowledge base</h2>
      <p className="muted">
        Documents the assistant searches before answering: manuals, price lists,
        policies, industry references. PDF, Word, Excel, text, Markdown, CSV,
        HTML and images, up to {KNOWLEDGE_LIMITS.fileBytes / 1_000_000} MB each.
        A file with the same name replaces the old one.
      </p>
      {library === null ? (
        <p className="muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="muted">No documents yet.</p>
      ) : (
        <ul className="list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <div>
                <div className="font-medium">{doc.name}</div>
                <div className="muted small flex items-center gap-2">
                  <StatusPill doc={doc} />
                  {fileSize(doc.size)}
                  {doc.error && <span>{doc.error}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {doc.status === "failed" && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => act(reindexKnowledge(doc.id))}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => act(deleteKnowledge(doc.id))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {library !== null && library.shared > 0 && (
        <p className="muted small">
          The assistant also searches {library.shared} shared documents from
          this deployment.
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <button
        type="button"
        className="primary-btn"
        disabled={uploading > 0 || library === null}
        onClick={() => input.current?.click()}
      >
        {uploading > 0 ? `Uploading ${uploading}…` : "Upload documents"}
      </button>
      {error && <p className="error whitespace-pre-line">{error}</p>}
    </section>
  );
}
