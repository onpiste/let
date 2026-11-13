import { describe, expect, it } from "vitest";

import {
  makeReplyQuote,
  messageReplyTo,
  REPLY_QUOTE_MAX_CHARS,
  replyContextText
} from "./reply";

describe("makeReplyQuote", () => {
  it("trims the text", () => {
    expect(makeReplyQuote("a", "assistant", "  hi \n")).toEqual({
      id: "a",
      role: "assistant",
      text: "hi"
    });
  });

  it("refuses a message with no text", () => {
    expect(makeReplyQuote("a", "user", "   ")).toBeNull();
  });

  it("clips a long message", () => {
    const quote = makeReplyQuote("a", "user", "x".repeat(10_000));
    expect(quote?.text).toHaveLength(REPLY_QUOTE_MAX_CHARS);
    expect(quote?.text.endsWith("…")).toBe(true);
  });
});

describe("messageReplyTo", () => {
  it("reads a valid quote", () => {
    const replyTo = { id: "m1", role: "assistant", text: "Paris" };
    expect(messageReplyTo({ metadata: { createdAt: 1, replyTo } })).toEqual(
      replyTo
    );
  });

  it("ignores missing or malformed quotes", () => {
    expect(messageReplyTo({})).toBeUndefined();
    expect(messageReplyTo({ metadata: { replyTo: "m1" } })).toBeUndefined();
    expect(
      messageReplyTo({ metadata: { replyTo: { id: "m1", role: "system" } } })
    ).toBeUndefined();
    expect(
      messageReplyTo({
        metadata: { replyTo: { id: 3, role: "user", text: "x" } }
      })
    ).toBeUndefined();
  });
});

describe("replyContextText", () => {
  it("quotes the message and says whose it was", () => {
    const text = replyContextText({ id: "m", role: "assistant", text: "42" });
    expect(text).toContain("your earlier message");
    expect(text).toContain("<quoted-message>\n42\n</quoted-message>");
  });
});
