import { describe, expect, it } from "vitest";

import { emailIdFromPath, inboxPath } from "./email";

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
