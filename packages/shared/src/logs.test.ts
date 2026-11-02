import { describe, expect, it } from "vitest";

import { errorData, normalizeLogEntry, redact } from "./logs";

describe("normalizeLogEntry", () => {
  const valid = {
    ts: "2026-11-01T10:00:00.000Z",
    level: "warn",
    source: "ios",
    scope: "socket",
    msg: "Socket closed",
    requestId: "abc"
  };

  it("keeps a valid entry", () => {
    expect(normalizeLogEntry(valid)).toEqual(valid);
  });

  it.each([
    null,
    "text",
    { ...valid, level: "fatal" },
    { ...valid, source: "android" },
    { ...valid, msg: "" }
  ])("rejects %j", (raw) => {
    expect(normalizeLogEntry(raw)).toBeNull();
  });

  it("drops fields a client may not set", () => {
    const entry = normalizeLogEntry({ ...valid, user: "x@y.z", extra: 1 });
    expect(entry).not.toHaveProperty("user");
    expect(entry).not.toHaveProperty("extra");
  });

  it("fills a missing or bad timestamp and scope", () => {
    const entry = normalizeLogEntry({ ...valid, ts: "soon", scope: 5 });
    expect(Number.isNaN(Date.parse(entry?.ts ?? ""))).toBe(false);
    expect(entry?.scope).toBe("app");
  });

  it("caps long messages and large data", () => {
    const entry = normalizeLogEntry({
      ...valid,
      msg: "x".repeat(5000),
      data: { output: "y".repeat(20_000) }
    });
    expect(entry?.msg).toHaveLength(2000);
    expect(entry?.data).toHaveProperty("truncated");
  });
});

describe("redact", () => {
  it("masks secret-looking keys at any depth", () => {
    expect(
      redact({
        apiKey: "sk-1",
        nested: { Authorization: "Bearer x", ok: 1 },
        list: [{ password: "p" }]
      })
    ).toEqual({
      apiKey: "[redacted]",
      nested: { Authorization: "[redacted]", ok: 1 },
      list: [{ password: "[redacted]" }]
    });
  });
});

describe("errorData", () => {
  it("describes errors and other thrown values", () => {
    expect(errorData(new TypeError("bad"))).toMatchObject({
      name: "TypeError",
      message: "bad"
    });
    expect(errorData("plain")).toEqual({ message: "plain" });
  });
});
