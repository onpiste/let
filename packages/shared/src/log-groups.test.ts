import { describe, expect, it } from "vitest";

import { groupErrors, logFingerprint, publicSample } from "./log-groups";
import type { LogEntry } from "./logs";

function entry(more: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: "2026-11-01T10:00:00.000Z",
    level: "error",
    source: "server",
    scope: "http",
    msg: "GET /chat failed",
    ...more
  };
}

describe("logFingerprint", () => {
  it("ignores ids, numbers and emails", () => {
    const a = entry({
      msg: "Chat 3f2b8c1e-1111-4222-8333-444455556666 failed after 120ms",
      data: { error: { name: "Error", message: "No row for a@b.co" } }
    });
    const b = entry({
      msg: "Chat 9a9a9a9a-2222-4333-8444-555566667777 failed after 7ms",
      data: { error: { name: "Error", message: "No row for c@d.org" } }
    });
    expect(logFingerprint(a)).toBe(logFingerprint(b));
  });

  it("ignores the stack, which changes with every deploy", () => {
    const error = { name: "TypeError", message: "x is undefined" };
    expect(
      logFingerprint(entry({ data: { error: { ...error, stack: "at a:1" } } }))
    ).toBe(
      logFingerprint(entry({ data: { error: { ...error, stack: "at b:9" } } }))
    );
  });

  it("separates sources, scopes and errors", () => {
    const prints = [
      entry(),
      entry({ source: "web" }),
      entry({ scope: "chat" }),
      entry({ msg: "POST /chat failed" }),
      entry({ data: { error: { name: "TypeError", message: "boom" } } })
    ].map(logFingerprint);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe("publicSample", () => {
  it("drops the user and free-form data, and masks emails", () => {
    const sample = publicSample(
      entry({
        user: "a@b.co",
        requestId: "req-1",
        msg: "Mail to a@b.co bounced",
        data: {
          body: "private",
          error: { name: "Error", message: "from a@b.co", stack: "at x" }
        }
      })
    );
    expect(JSON.stringify(sample)).not.toContain("a@b.co");
    expect(JSON.stringify(sample)).not.toContain("private");
    expect(sample.requestId).toBe("req-1");
    expect(sample.msg).toBe("Mail to <email> bounced");
  });
});

describe("groupErrors", () => {
  it("counts occurrences, users and versions per problem", () => {
    const groups = groupErrors([
      entry({ ts: "2026-11-01T10:02:00.000Z", user: "a@b.co", version: "v2" }),
      entry({ ts: "2026-11-01T10:00:00.000Z", user: "c@d.co", version: "v1" }),
      entry({ ts: "2026-11-01T10:01:00.000Z", user: "a@b.co", version: "v1" }),
      entry({ scope: "apns", msg: "Push failed" }),
      entry({ level: "warn", msg: "Slow" })
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      scope: "http",
      count: 3,
      users: 2,
      versions: ["v2", "v1"],
      firstSeen: "2026-11-01T10:00:00.000Z",
      lastSeen: "2026-11-01T10:02:00.000Z"
    });
    expect(groups[0]?.sample.ts).toBe("2026-11-01T10:02:00.000Z");
    expect(groups[1]).toMatchObject({ scope: "apns", count: 1, users: 0 });
  });
});
