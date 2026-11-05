import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_LIMITS,
  knowledgeDocPath,
  knowledgeStatus,
  validateKnowledgeFile
} from "./knowledge";

describe("validateKnowledgeFile", () => {
  it("keeps the base name of a supported file", () => {
    expect(validateKnowledgeFile("docs/Price list.PDF", 10)).toBe(
      "Price list.PDF"
    );
    expect(validateKnowledgeFile("..\\..\\notes.md", 10)).toBe("notes.md");
  });

  it("drops control characters", () => {
    expect(validateKnowledgeFile("a\u0000b\n.txt", 1)).toBe("ab.txt");
  });

  it("rejects unsupported, empty and oversized files", () => {
    expect(() => validateKnowledgeFile("tool.exe", 10)).toThrow(/\.exe/);
    expect(() => validateKnowledgeFile("README", 10)).toThrow(/\.\?/);
    expect(() => validateKnowledgeFile("a.txt", 0)).toThrow(/empty/);
    expect(() =>
      validateKnowledgeFile("a.pdf", KNOWLEDGE_LIMITS.fileBytes + 1)
    ).toThrow(/MB/);
    expect(() => validateKnowledgeFile("/", 10)).toThrow(/name/);
  });
});

describe("knowledgeStatus", () => {
  it("maps AI Search item states", () => {
    expect(knowledgeStatus("completed")).toBe("ready");
    expect(knowledgeStatus("error")).toBe("failed");
    expect(knowledgeStatus("skipped")).toBe("failed");
    expect(knowledgeStatus("queued")).toBe("indexing");
    expect(knowledgeStatus("outdated")).toBe("indexing");
  });
});

describe("knowledgeDocPath", () => {
  it("encodes the id", () => {
    expect(knowledgeDocPath("a/b c")).toBe("/chat/knowledge/a%2Fb%20c");
    expect(knowledgeDocPath("x", true)).toBe("/chat/knowledge/x/reindex");
  });
});
