import { describe, expect, it } from "vitest";

import { emailIdFromPath, inboxPath, normalizeEmailDraft } from "./email";

describe("inbox paths", () => {
  it("round-trips an email id", () => {
    expect(inboxPath(42)).toBe("/inbox/42");
    expect(emailIdFromPath(inboxPath(42))).toBe(42);
  });

  it("finds no email in the list or other paths", () => {
    expect(emailIdFromPath(inboxPath())).toBeNull();
    expect(emailIdFromPath("/inbox/abc")).toBeNull();
    expect(emailIdFromPath("/tasks")).toBeNull();
  });
});

describe("normalizeEmailDraft", () => {
  const draft = { to: " Bob@Example.com ", subject: "  Hi  ", body: "Hello" };

  it("trims the address, keeps its case and keeps the rest", () => {
    expect(normalizeEmailDraft({ ...draft, inReplyTo: 3 })).toEqual({
      to: "Bob@Example.com",
      subject: "  Hi  ",
      body: "Hello",
      inReplyTo: 3
    });
  });

  it("rejects a subject over more than one line", () => {
    expect(() =>
      normalizeEmailDraft({ ...draft, subject: "Hi\r\nBcc: x@y.z" })
    ).toThrow();
  });

  it("rejects bad addresses and empty parts", () => {
    expect(() =>
      normalizeEmailDraft({ ...draft, to: "a@b.c, d@e.f" })
    ).toThrow();
    expect(() => normalizeEmailDraft({ ...draft, to: "nobody" })).toThrow();
    expect(() => normalizeEmailDraft({ ...draft, body: " " })).toThrow();
    expect(() => normalizeEmailDraft({ ...draft, inReplyTo: "3" })).toThrow();
  });
});
