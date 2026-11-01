import { describe, expect, it } from "vitest";

import { searchSnippet } from "./chats";

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
