import { describe, expect, it } from "vitest";

import {
  appendChats,
  chatCursor,
  checkChatTitle,
  editedParts,
  parseChatCursor,
  searchSnippet,
  type ChatSummary
} from "./chats";

const chat = (id: string, updatedAt = "2026-11-01T10:00:00.000Z") =>
  ({
    id,
    title: id,
    updatedAt,
    active: false,
    running: false
  }) satisfies ChatSummary;

describe("chat cursors", () => {
  it("round-trips a page's last chat", () => {
    const last = chat("b1c2", "2026-11-01T10:00:00.000Z");
    expect(parseChatCursor(chatCursor(last))).toEqual({
      updatedAt: last.updatedAt,
      id: last.id
    });
  });

  it("starts at the first page without a cursor", () => {
    expect(parseChatCursor(null)).toBeNull();
    expect(parseChatCursor(undefined)).toBeNull();
  });

  it("rejects anything else", () => {
    for (const bad of [
      42,
      "",
      "no-bar",
      "|id",
      "not a date|id",
      "x".repeat(201)
    ])
      expect(() => parseChatCursor(bad)).toThrow("Bad history cursor.");
  });
});

describe("appendChats", () => {
  it("adds a page, skipping chats already shown", () => {
    const shown = [chat("a"), chat("b")];
    const page = [chat("b"), chat("c")];
    expect(appendChats(shown, page).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("searchSnippet", () => {
  it("finds a match regardless of case", () => {
    expect(searchSnippet("Plan the Trip to Kyoto", "trip")).toBe(
      "Plan the Trip to Kyoto"
    );
  });

  it("returns null without a match or a query", () => {
    expect(searchSnippet("hello", "bye")).toBeNull();
    expect(searchSnippet("hello", "  ")).toBeNull();
  });

  it("matches non-Latin text", () => {
    expect(searchSnippet("明天提醒我买牛奶", "牛奶")).toBe("明天提醒我买牛奶");
  });

  it("cuts long text around the match with ellipses", () => {
    const text = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
    const snippet = searchSnippet(text, "needle") ?? "";
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("needle");
    expect(snippet.length).toBeLessThanOrEqual(122);
  });

  it("flattens newlines", () => {
    expect(searchSnippet("line one\n\nline two", "two")).toBe(
      "line one line two"
    );
  });
});

describe("checkChatTitle", () => {
  it("trims and flattens", () => {
    expect(checkChatTitle("  Trip\n to  Kyoto ")).toBe("Trip to Kyoto");
  });

  it("rejects empty, long or non-string titles", () => {
    for (const bad of ["", "   ", 7, null, "x".repeat(81)])
      expect(() => checkChatTitle(bad)).toThrow();
  });
});

describe("editedParts", () => {
  const pasted = '<file name="a.txt">\nhello\n</file>';

  it("replaces the typed text and keeps attachments", () => {
    const parts = [
      { type: "file", url: "data:x", mediaType: "image/png" },
      { type: "text", text: pasted },
      { type: "text", text: "old question" }
    ];
    expect(editedParts(parts, " new question ")).toEqual([
      parts[0],
      parts[1],
      { type: "text", text: "new question" }
    ]);
  });

  it("keeps a pasted file sharing a part with typed text", () => {
    const parts = [{ type: "text", text: `${pasted}\nold` }];
    expect(editedParts(parts, "new")).toEqual([
      { type: "text", text: `${pasted}\n` },
      { type: "text", text: "new" }
    ]);
  });

  it("drops the text when the edit is blank", () => {
    expect(editedParts([{ type: "text", text: "old" }], "  ")).toEqual([]);
  });
});
